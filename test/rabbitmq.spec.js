const assert = require('assert');

const RabbitMQ = require('../');

const testConfig = {
  host: 'localhost',
  port: 5672,
  queues: [{name: 'test'}],
  username: 'guest',
  password: 'guest'
};

describe('RabbitMQ', function() {
  this.timeout(20000);
  let rabbit;

  beforeEach(function(done) {
    rabbit = new RabbitMQ(testConfig);
    done();
  });

  afterEach(function(done) {
    rabbit.closeConnection()
      .then(function() {
        done();
      })
      .catch(function(e) {
        done(e)
      })
  });

  describe('instantiating the class', function() {
  
    it('should be an object', function(done) {
      assert.equal(typeof(rabbit), 'object', 'Rabbit is an object');
      done();
    });

    it('should fire a ready event with a channel', function(done) {
      rabbit.on('ready', function(channel) {
        assert.equal(typeof(channel), 'object', 'Channel is an object');
        done();
      });
    });
  });

  describe('sendToQueue and consume', function() {

    it('should send a message to queue and be retrievable', function(done) {
      rabbit.on('ready', function() {
        rabbit.sendToQueue('test', 'Hello message')
        setTimeout(function() {
          rabbit.consume('test', function(msg) {
            assert.equal(msg, 'Hello message', 'Rabbit send to queue');
            done();
          })
        }, 1000);
      });
    });
  });
});

