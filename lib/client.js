_.extend(FSM.prototype, {
  initializeMethods: function(options) {
    // Let's start with the execution method
    var collection = this;    
        
    if (options.generateStubs) {
      var transitions = _.pick(this.transitionsDefs, function(value,key) {
        return value.permission;
      })
      
      var methods = {};
      var self = this;
      _.each(transitions, function(record,transition) {
        methods[this.fsm.methodName(transition)] = function(docId,parameters) {
          var doc = self.findOne(docId);
          doc.executeTransition(this.usedId,transition,parameters);
          return doc.afterTransition(userId,transition,parameters);
        }
      }, this);
      
      Meteor.methods(methods);
    }
  },
  remoteTransition: function(transition,parameters,callback) {
    if (!parameters) {
      parameters = {};
    }
    var userId = Meteor.userId()
    if (this.beforeTransition(userId,transition,parameters)) {
      this.check(userId,transition,parameters);
      Meteor.call(this.fsm.methodName(transition),parameters,callback);
    } else {
      throw new Meteor.Error("illegal-transition","Prerequistic for transition " + transition + " have failed!");
    }
  }
});