RabbitMQ Service Client Library
---

## Introduction
This is a thin-wrapper over the amqp library that provides an interface for 
interacting with RabbitMQ queues.

## How to Use
Upon requiring in the library, it will pass back a Javascript class constructor
that will need to be instantiated via the `new` keyword and a configuration object.

### Example

```
const RabbitMQ = require('rabbitmq-service-client');

const rabbitConfig = {
  host: 'rabbit-host',
  port: '5672',
  username: 'imauser',
  password: 'imapw',
  queues: [{
    name: 'test_queue'  
  }]  
};

const rabbit = new RabbitMQ(rabbitConfig);

// Can wait for the `ready` event...
rabbit.on('ready', function(channel) {
  rabbit.sendToQueue('queue_name', 'This is a test message'); // returns true on success
})

// To retry connection on error
rabbit.on('connectionerror', function(err) {
  console.error(err);
  rabbit.connect();
});

```

### Configuration options
  - `host` - required
  - `port` - required
  - `username`
  - `password`
  - `queues` - Must be an array of objects
  - `no_duplicates` - Will utilize an in memory cache on the application to prevent duplicates   
  
__N.B.__ Defaults for options are `undefined`

### Events
  - `connecting`
  - `connected` - Connected to RabbitMQ server, but no channels yet
  - `ready` - Queues are ready to be enacted with
  - `connectionerror`

### Running Tests

Setup a docker container:  
`$ docker run -d --hostname my-rabbit --name rabbit -p 8080:15672 -p 5672:5672 rabbitmq:3-management`  

Run the tests:  
`$ npm test`

