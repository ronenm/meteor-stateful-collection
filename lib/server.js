_.extend(StatefullCollection.prototype, {
  initializeMethods: function(options) {
    // Let's start with the execution method
    var collection = this;    
    
    if (options.generateMethods) {
      var transitions = _.pick(this.transitionsDefs, function(value,key) {
        return value.permission;
      })
      
      var methods = {};
      var self = this;
      _.each(transitions, function(record,transition) {
        methods[this.fsm.methodName(transition)] = function(docId,parameters) {
          var doc = self.findOne(docId);
          doc.doTransition(this.usedId,transition,parameters);
        }
      }, this);
      
      Meteor.methods(methods);
    }
  },
  doTransition: function(userId,transition,parameters,skipPermission) {
    if (!parameters) {
      parameters = {};
    }
    if (this.beforeTransition(userId,transition,parameters,skipPermission)) {
      this.check(userId,transition,parameters);
      this.executeTransition(userId,transition,parameters);
      return this.afterTransition(userId,transition,parameters);
    } else {
      throw new Meteor.Error("illegal-transition","Prerequistic for transition " + transition + " have failed!");
    }
  }
});