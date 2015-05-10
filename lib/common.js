var STATEFUL_OPTIONS = {
  transitions: {},
  availableTransitions: 'availableTransitions',
  stateField: 'state',
  executeTransitionMethod: null,
  generateMethods: true,
  generateStubs: true,
  nextStateSetMethod: null,
  methodsPrefix: null,
  after: null,
  before: null
};

//
//
//
StatefullCollection = {
  create: function(name,statefullOptions,collectionOptions) {
    collectionOptions = collectionOptions || _.pick(statefullOptions,'connection','idGeneration','transform');
    statefullOptions = _.omit(statefullOptions,'connection','idGeneration','transform');
    
    _.defaults(statefullOptions,{methodsPrefix: name});
    
    var fsm = new FSM(statefullOptions);
    if (!_.has(statefullOptions,'addTransform') || statefullOptions.addTransform) {
      collectionOptions.transform = fsm.transformer(collectionOptions.transform);
    }
    
    var collection = new Mongo.Collection(name,collectionOptions);
    // Circular reference may not be removed by garbage collectors,
    // however we are talking here about singletone objects (the collection)
    fsm.collection = collection;
    collection.fsm = fsm;
    return collection;
  }
}



// You can seperate the collectionOptions or add them to the statefulOptions
FSM = function(options) {
  _.defaults(options,STATEFUL_OPTIONS);
   
  this.methodsPrefix = options.methodsPrefix;
   
  this.instanceMethods = {};
   
  if (_.isFunction(options.availableTransitions)) {
    this.instanceMethods.getAvailableTransitions = options.availableTransitions;
  } else {
      var availableTransitions = options.availableTransitions;
      if (!availableTransitions) {
        availableTransitions = "availableTransitions";
      }
      this.instanceMethods.getAvailableTransitions = function() {
        // Assume that there is a field in the doc that returns available transitions
        return this[availableTransitions];
      };
  }
  
  this.stateField = options.stateField;
  this.after = _get_callback_by_context(options.after);
  this.before = _get_callback_by_context(options.before);
  
  // General definitions setting
  this.processDefs(options.transitions);
  
  var meteor_context = Meteor.isServer ? 'server' : 'client';
  if (options.executeTransitionMethod) {  
    this.instanceMethods.executeTransition = _.isFunction(options.executeTransitionMethod) ? options.executeTransitionMethod :
                                                  options.executeTransitionMethod[meteor_context];
  }
  if (!_.isFunction(this.instanceMethods.executeTransition)) {
    this.instanceMethods.executeTransition = function(userId,transition,parameters) {
      return this.fsm.collection.update(this._id, { $set: this.nextStateSet(userId,transition,parameters) });
    }
  }

  if (options.nextStateSetMethod) {  
    this.instanceMethods.nextStateSet = _.isFunction(options.nextStateSetMethod) ? options.nextStateSetMethod :
                                      options.nextStateSetMethod[meteor_context];
  }
  if (!_.isFunction(this.instanceMethods.nextStateSet)) {
    this.instanceMethods.nextStateSet = function(userId,transition,parameters) {
      return _.extend({state: 'waiting'},parameters);
    }
  }
  // This is defined seperatly for servers and clients
  this.initializeMethods(options);
}

StatefullCollectionInstance = function(doc,fsm) { 
  _.extend(this, doc);
  _.extend(this,fsm.instanceMethods);
  this.fsm = fsm;
}

_.extend(FSM.prototype, {
  // We support a limited FSM functionality. You can connect this with a more complete FSM solution
  // such as StateMachine library
  processDefs: function(transitions) {
    this.transitionsDefs = {};
    _.map(transitions,function(value,transition) {
      this[transition] = {
        permission: _create_permission_function(value.permission),
        check: _create_check_function(value.check,value.permission),
        before: _get_callback_by_context(value.before),
        after: _get_callback_by_context(value.after)
      }
    },this.transitionsDefs);
  },
  transformer: function(nextTransform) {
    // Create a transform function that can be used in the collection constructor and/or other collection functions
    var fsm = this;
    return function (doc) {
      doc = new StatefullCollectionInstance(doc,fsm);
      if (_.isFunction(nextTransform)) {
        doc = nextTransform(doc);
      }
      return doc;
    }
  },
  methodName: function(transition) {
    return this.methodsPrefix+":"+transition;
  }
});

_.extend(StatefullCollectionInstance.prototype, {
  getAllowedTransitions: function(userId) {
    return _.filter(this.getAvailableTransitions(), function(transition) { return this.permitted(userId,transition); },this);
  },
  canTransition: function(userId, transition, skipPermission) {
    return ((skipPermission || this.permitted(userId,transition)) && _.contains(this.getAvailableTransitions(),transition));
  },
  performCallback: function(cb,userId,transition,parameters) {
    if (_.isFunction(cb)) {
      return cb.apply(this,[userId,transition,parameters]);
    } else {
      return true;
    }
  },
  beforeTransition: function(userId,transition,parameters,skipPermission) {
    console.log("Before transition: ",userId,transition,parameters,skipPermission);
    if (this.canTransition(userId,transition,skipPermission)) {
      var transitionDef = this.fsm.transitionsDefs[transition];
      return this.performCallback(transitionDef.before || this.fsm.before,userId,transition,parameters);
    } else {
      throw new Meteor.Error("illegal-transition","Transition " + transition + " is not allowed.");
    }
  },
  check: function(userId,transition,parameters) {
    this.fsm.transitionsDefs[transition].check.apply(this,[userId,transition,parameters]);
  },
  afterTransition: function(userId,transition,parameters) {
    var transitionDef = this.fsm.transitionsDefs[transition];
    return this.performCallback(transitionDef.after || this.fsm.after,userId,transition,parameters);
  },
  currentState: function() {
    return this[this.fsm.stateField];
  },
  permitted: function(userId, transition) {
    var transitionDef = this.fsm.transitionsDefs[transition];
    if (!(transitionDef && transitionDef.permission)) return false;
    
    return transitionDef.permission.apply(this,[userId,transition]);
  }
});


// This we can export for other usage
ArrayLengthMatch = function(length) {
  Match.Where(function(arr) {
    return arr.length == length;
  });
}

var _get_callback_by_context = function(cb) {
  if (_.isFunction(cb)) {
    return cb;
  }
  if (_.isArray(cb)) {
    if (Meteor.isServer) {
      return cb[0];
    } else {
      return cb[1];
    }
  }
  if (_.isObject(cb)) {
    if (Meteor.isServer) {
      return cb.server;
    } else {
      return cb.client;
    }
  }
  return null; 
}

var _create_check_function = function(checkers, isPublic) {
  if (!checkers ) {
    if (isPublic) {
      throw new Meteor.Error("Missing checker","You must define a checker for publish state");
    }
    return function() { }
  }
  
  if (_.isFunction(checkers)) return checkers;
  
  return function(userId,transition,parameters) {
    return check(parameters,checkers);
  };
}

var _create_permission_function = function(permission) {
  if (!permission) {
    return null;
  } else if (_.isFunction(permission)) {
    return permission;
  } else if (permission == true) {
    return function() {
      return true;
    }
  } else {
    return function(userId) {
      return (this[permission]==userId);
    }
  }
}
