var STATEFUL_OPTIONS = {
  transitions: {},
  availableTransitions: 'availableTransitions',
  stateField: 'state',
  executeTransitionMethod: null,
  generateMethods: true,
  generateStubs: true,
  addTransform: true,
  nextStateSetMethod: null,
  methodsPrefix: null,
  after: null,
  before: null
};

// You can seperate the collectionOptions or add them to the statefulOptions
StatefullCollection = function(name,statefullOptions,collectionOptions) {
  collectionOptions = collectionOptions || _.pick(statefullOptions,'connection','idGeneration','transform');
  statefullOptions = _.omit(statefullOptions,'connection','idGeneration','transform');
  
  var options = _.clone(collectionOptions);
  _.defaults(options,STATEFUL_OPTIONS);
  
  if (options.addTransform) {
    collectionOptions.transform = this.transformer(collectionOptions.transform);
  }
  
  Mongo.Collection.call(this,name,collectionOptions);
  
  this.transitionsDefs = options.transitions;
  
  this.methodsPrefix = options.methodsPrefix || name;
  
  if (_.isFunction(options.availableTransitions)) {
    this._availableTransitions = options.availableTransitions;
  } else {
      var availableTransitions = options.availableTransitions;
      if (!availableTransitions) {
        availableTransitions = "availableTransitions";
      }
      this._availableTransitions = function(userId) {
        // Assume that there is a field in the doc that returns available transitions
        return this[availableTransitions];
      };
  }
  
  this.stateField = options.stateField;
  this.after = _get_callback_by_context(options.after);
  this.before = _get_callback_by_context(options.before);
  
  // General definitions setting
  this.processDefs();
  
  var meteor_context = Meteor.isServer ? 'server' : 'client';
  if (_.has(options,'executeTransitionMethod')) {  
    this.executeTransition = _.isFunction(options.executeTransitionMethod) ? options.executeTransitionMethod :
                             options.executeTransitionMethod[meteor_context];
  }
  if (!_.isFunction(this.executeTransition)) {
    var collection = this;
    this.executeTransition = function(userId,transition,parameters) {
      return collection.update(this._id, { $set: this.nextStateSet(userId,transition,parameters) });
    }
  }

  if (_.has(options,'nextStateSetMethod')) {  
    this.nextStateSet = _.isFunction(options.nextStateSetMethod) ? options.nextStateSetMethod :
                                      options.nextStateSetMethod[meteor_context];
  }
  if (!_.isFunction(this.nextStateSet)) {
    this.nextStateSet = function(userId,transition,parameters) {
      return _.extend({state: 'waiting'},parameters);
    }
  }
  // This is defined seperatly for servers and clients
  this.initializeMethods(options);
}

StatefullCollectionInstance = function(doc,fsm) { 
  _.extend(this, doc);
  _.extend(this,_.pick(fsm,'nextStateSet','executeTransition'));
  this.fsm = fsm;
}

_.extend(StatefullCollection.prototype, {
  // We support a limited FSM functionality. You can connect this with a more complete FSM solution
  // such as StateMachine library
  processDefs: function() {
    this.transitionsDefs = _.mapObject(this.transitionsDefs,function(value,transition) {
      return {
        permission: _create_permission_function(value.permission),  // if permission is not false the transition is public but may be restricted
        check:  _create_check_function(value.check,value.permission),
        before: _get_callback_by_context(value.before,true),
        after: _get_callback_by_context(value.before,true)
      }
    });
  },
  transformer: function(doc,nextTransform) {
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
  availableTransitions: function(userId) {
    return this.fsm._availableTransitions.apply(this,[userId]);
  },
  canTransition: function(userId, transition, skipPermission) {
    return ((skipPermission || this.permitted(userId,transition)) && _.contains(this.availableTransitions(userId),transition));
  },
  performCallback: function(cb,userId,transition,parameters) {
    if (_.isFunction(cb)) {
      return cb.apply(this,[userId,transition,parameters]);
    } else {
      return true;
    }
  },
  beforeTransition: function(userId,transition,parameters,skipPermission) {
    if (this.canTransition(userId,transition,skipPermission)) {
      var meteor_context = Meteor.isServer ? 'server' : 'client';
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
    var meteor_context = Meteor.isServer ? 'server' : 'client';
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
  if (_.isfunction(cb)) {
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
      throw new Meteor.Error("Missing checker","You must defined a checker for publish state");
    }
    return function() { }
  }
  
  if (_.isfunction(checkers)) return checkers;
  
  return function(userId,transition,parameters) {
    check(parameters,checkers);
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
