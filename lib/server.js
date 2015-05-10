_.extend(FSM.prototype, {
  initializeMethods: function(options) {
    if (options.generateMethods) {
      var legelTransition = _.select(_.keys(this.transitionsDefs), function(key) {
        return this[key].permission;
      },this.transitionsDefs);
      
      var transitions = _.pick(this.transitionsDefs,legelTransition);
      
      var methods = {};
      var self = this;
      _.each(transitions, function(record,transition) {
        console.log("Initializing method: ",this.methodName(transition));
        methods[this.methodName(transition)] = function(docId,parameters) {
          var doc = self.collection.findOne(docId);
          doc.doTransition(this.userId,transition,parameters);
        }
      }, this);
      
      Meteor.methods(methods);
    }
  }
});

_.extend(StatefullCollectionInstance.prototype,{
  doTransition: function(userId,transition,parameters,skipPermission) {
    if (!parameters) {
      parameters = {};
    }
    console.log("doTransition: ",userId,transition,parameters);
    if (this.beforeTransition(userId,transition,parameters,skipPermission)) {
      this.check(userId,transition,parameters);
      this.executeTransition(userId,transition,parameters);
      return this.afterTransition(userId,transition,parameters);
    } else {
      throw new Meteor.Error("illegal-transition","Prerequistic for transition " + transition + " have failed!");
    }
  }
});