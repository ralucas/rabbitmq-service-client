#!/usr/bin/env node

'use strict'

const amqp = require('amqplib');
const EventEmitter = require('events');
const crypto = require('crypto');
const md5Hash = crypto.createHash('md5');

const getConnString = (config) => {
  return 'amqp://' + config.username + ':' +
    config.password + '@' + config.host + ':' + config.port + '/';
};

class Rabbit extends EventEmitter {

  constructor(config) {
    super();

    if (!config) {
      throw new Error("Config required!");
    }

    this.config = config;

    this.connectionString = getConnString(config);
    this.socketOptions = config.socketOptions || {};

    this.queueCache = {};

    this.connect();
  }

  connect() {
    const self = this;

    return this.createConnection()
      .then(self.createChannel.bind(self))
      .then(self.setChannel.bind(self))
      .then(channel => {
        if (this.config.queues && this.config.queues.length) {
          return this.createQueues(this.config.queues);
        }
        return Promise.resolve();
      })
      .then(() => {
        self.emit('ready', self.channel);
        return Promise.resolve();
      })
      .catch(self.handleErrors.bind(self));
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
    this.emit('channel_created', ch);
    return ch;
  }

  createQueues(queues) {
    const qs = Array.isArray(queues) ? queues : [queues];
    const promises = qs.map((queue) => {
      const queueOpts = Object.assign({
        durable: true
      }, queue.options);
      // Create a new set for caching queues
      if (this.config.no_duplicates && !self.queueCache[queue.name]) {
        self.queueCache[queue.name] = new Set();
      }
      return this.channel.assertQueue(queue.name, queueOpts);
    });
    return Promise.all(promises);
  }

  publish(msg) {
    const exchange = this.config.exchange;
    this.channel.assertExchange(exchange, 'fanout', {durable: true});
    this.channel.publish(exchange, '', new Buffer(msg));
  }

  consume(q, cb) {
    const queue = this.config.queues.find(queue => queue.name === q);
    this.channel.prefetch(1);
    this.channel.consume(queue.name, (msg) => {
      const message = msg.content.toString();
      this.channel.ack(msg);
      return cb && cb(message, msg.fields);
    }, {noAck: false});
  }

  sendToQueue(q, msg) {
    const queue = this.config.queues.find(queue => queue.name === q);
    // TODO: Needs option to create the queue if it doesn't exist
    if (!queue) {
      throw new Error("Queue " + q + " does not exist");
    }
    if (typeof(msg) !== 'string') {
      throw new Error("Message must be a string");
    }

    if (this.config.no_duplicates) {
      // On a message collision, emit event and return out
      const msgMd5 = md5Hash.update(msg).digest('hex');
      if (this.queueCache[queue.name].has(msgMd5)) {
        this.emit('message_collision', msg);
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
    this.emit('connection_error', err);
    console.error("Error in RabbitMQ", err);
    return this.closeAll();
  }

  closeChannel() {
    try {
      return this.channel.close();
    } catch(e) {
      console.error(e, this.channel);
      return Promise.resolve();
    }
  }

  closeConnection() {
    try {
      return this.connection.close();
    } catch(e) {
      console.error(e);
      return Promise.resolve();
    }
  }

  closeAll() {
    return this.closeChannel()
      .then(() => {
        return this.closeConnection();
      });
  }

}  

module.exports = Rabbit;

