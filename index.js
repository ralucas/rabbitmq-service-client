#!/usr/bin/env node

const amqp = require('amqplib');
const EventEmitter = require('events');
const crypto = require('crypto');
const md5Hash = crypto.createHash('md5');

const getConnString = (config) => {
  return `amqp://${config.username}:${config.password}@${config.host}:${config.port}/`;
}

class Rabbit extends EventEmitter {

  constructor(config) {
    super();

    if ( !config ) {
      throw new Error("Config required!");
    }
    this.config = config;

    this.connectionString = getConnString(config);
    this.socketOptions = config.socketOptions || {};

    this.queueCache = {};

    this.connect();
  }

  connect() {
    const _this = this;

    return this.createConnection()
      .then(_this.createChannel.bind(_this))
      .then(_this.setChannel.bind(_this))
      .then(() => {
        _this.emit('ready', _this.channel);
      })
      .then(null, _this.handleErrors.bind(_this));
  }

  createConnection() {
    this.emit('connecting');
    return amqp.connect(this.connectionString, this.socketOptions);
  }

  createChannel(conn) {
    this.connection = conn;
    this.emit('connected', conn);
    return this.connection.createChannel();
  }

  setChannel(ch) {
    this.channel = ch;
    this.emit('channelcreated', ch);
    return ch;
  }

  createQueues(queues) {
    const _this = this;
    const channel = this.channel;
    let qs = queues || this.config.queues;
    qs = Array.isArray(qs) ? qs : [qs];
    const promises = qs.map(queue => {
      const queueOpts = Object.assign({
        durable: true
      }, queue.options);
      // Create a new set for caching queues
      if ( this.config.no_duplicates && !_this.queueCache[queue.name] ) {
          _this.queueCache[queue.name] = new Set();
      }
      return channel.assertQueue(queue.name, queueOpts); 
    })
    return Promise.all(promises);
  }

  publish(msg) {
    const exchange = this.config.exchange;
    this.channel.assertExchange(exchange, 'fanout', {durable: true});
    this.channel.publish(exchange, '', new Buffer(msg));
  }

  consume(q, cb) {
    const queue = this.config.queues.find(queue => queue.name == q);
    this.channel.prefetch(1);
    this.channel.consume(queue.name, (msg) => {
      const message = msg.content.toString();
      this.channel.ack(msg);
      return cb && cb(message, msg.fields);
    }, {noAck: false});
  }

  sendToQueue(q, msg) {
    const queue = this.config.queues.find(queue => queue.name == q);
    // TODO: Do we want to just create the queue if it doesn't exist
    // or throw this error?
    if ( !queue ) {
      throw new Error("Queue " + q + " does not exist");
    }
    if ( typeof(msg) != 'string' ) {
      throw new Error("Message must be a string");
    }

    if ( this.config.no_duplicates ) {
      // On a message collision, emit event and return out
      const msgMd5 = md5Hash.update(msg).digest('hex');
      if ( this.queueCache[queue.name].has(msgMd5) ) {
        this.emit('messagecollision', msg);
      } else {
        this.queueCache[queue.name].add(msgMd5);
      }
    }

    const buf = new Buffer(msg);
    const opts = Object.assign({
      persistent: true
    }, queue.sendOptions);

    // Assert queue then send
    this.channel.assertQueue(q, {durable: true});
    this.channel.sendToQueue(q, buf, opts);
  }

  handleErrors(err) {
    this.emit('connectionerror', err);
    console.error("Error in RabbitMQ", err);
    if ( this.connection ) {
      this.connection.close();
    }
  }

}  

module.exports = Rabbit;

