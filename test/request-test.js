/**
 * Copyright 2023 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const assert = require('chai').assert;
const nock = require('nock');
const Stream = require('stream');
const bunyan = require('bunyan');
const Https = require('https');

const RequestLib = require('../src/request');

const logger = (() => {
  try {
    return bunyan.createLogger({
      name: 'Cluster-Updater',
      streams: [{
        level: (process.env.LOG_LEVEL || 'info'),
        stream: process.stdout // log LOG_LEVEL and above to stdout
      }],
      serializers: bunyan.stdSerializers
    });
  } catch (err) {
    // unknown log level given, default to info
    return bunyan.createLogger({
      name: 'Cluster-Updater',
      streams: [{
        level: ('info'),
        stream: process.stdout // log level and above to stdout
      }],
      serializers: bunyan.stdSerializers
    });
  }
})();

describe('request', () => {
  describe('getStream', () => {
    it('should return stream that receives response, data, and error events with expected response code and payload', (done) => {
      // Create a dummy stream that will return data 3 times and then an error
      let eventCount = 0;
      const mockEventStream = new Stream.Readable({
        objectMode: true,
        read: function() {
          eventCount++;
          if (eventCount <= 3) {
            logger.info( `stream returning data (event ${eventCount})` );
            return this.push(JSON.stringify({message: `event${eventCount}`}));
          }
          else {
            logger.info( `stream returning error (event ${eventCount})` );
            return this.emit('error', new Error( 'errstring' ));
          }
        }
      });

      // Start nock, returning dummy stream
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(200, mockEventStream);

      let gotResponse = false;
      let gotData = false;
      try {
        // Get a stream, verify it receives events
        RequestLib.getStream({
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
        })
          .on( 'response', (response) => {
            gotResponse = true;
            assert.equal(response.statusCode, 200);
          } )
          .on( 'data', (data) => {
            gotData = true;
            const parsedData = JSON.parse( data );
            assert.exists(parsedData.message);
          } )
          .on( 'error', (err) => {
            assert.equal( err, 'Error: errstring' );
            assert.isTrue(gotResponse, 'Response event was not received');
            assert.isTrue(gotData, 'Data event was not received');
            done();
          } );
      } catch (err) {
        done( err );
      }
    });
  });

  describe('doRequest', () => {
    it('should handle GET with standard options (json:true, simple:false, full:true)', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(409, testPayload);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
        }).then( response => {
          assert.equal( response.statusCode, 409 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          done( error );
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle GET http error response with simple:true as an error, with conversion', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(409, testPayload);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: true,
        }).then( response => {
          done( new Error(`Promise resolved despite 409 response code: ${response}`) );
        }).catch( error => {
          assert.equal( error.response.statusCode, 409, 'Response error statusCode was not converted' );
          done();
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle failed GET as an error', (done) => {
      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .replyWithError('bad things happened man');

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
        }).then( response => {
          done( new Error(`Promise resolved despite reply error: ${response}`) );
        }).catch( error => {
          assert.strictEqual(error.message, 'bad things happened man', 'Exception should be the bad response');
          done();
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle GET with full:false', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(406, testPayload);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: false,
          json: true,
          simple: false,
        }).then( response => {
          assert.deepEqual( response, testPayload );
          done();
        }).catch( error => {
          done( error );
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle GET with https agent', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(406, testPayload);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
          agent: new Https.Agent()
        }).then( response => {
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          done( error );
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle POST with standard options (json:true, simple:false, full:true)', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning whatever was posted
      nock('https://localhost:666')
        .post('/testEndpoint')
        .reply(409, (uri, requestBody) => requestBody);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'post',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          body: testPayload,
          json: true,
          simple: false,
        }).then( response => {
          assert.equal( response.statusCode, 409 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          done( error );
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle POST with json holding payload', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning whatever was posted
      nock('https://localhost:666')
        .post('/testEndpoint')
        .reply(409, (uri, requestBody) => requestBody);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'post',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: testPayload,
          simple: false,
        }).then( response => {
          assert.equal( response.statusCode, 409 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          done( error );
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle POST with form holding payload', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning whatever was posted
      nock('https://localhost:666')
        .post('/testEndpoint')
        .reply(409, (uri, requestBody) => {
          const parts = requestBody.split('=');
          const retVal = {};
          retVal[parts[0]] = parts[1];
          return retVal;
        });

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'post',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          form: testPayload,
          json: true,
          simple: false,
        }).then( response => {
          assert.equal( response.statusCode, 409 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          done( error );
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle GET with standard AWS options (json:true, simple:false, full:true, aws: { key, secret, sign_version: 4 }, headers: {})', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(409, testPayload);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
          aws: {
            key: 'key',
            secret: 'secret',
            sign_version: 4,
          },
          // headers:{}  -- Should succeed even if headers not specified at all
        }).then( response => {
          try {
            assert.equal( response.statusCode, 409 );
            assert.deepEqual( response.body, testPayload );
            done();
          }
          catch(err) {
            done(err);
          }
        }).catch( error => {
          done(error);
        } );
      } catch (err) {
        done( err );
      }
    });

    it('should handle GET with invalid AWS options', (done) => {
      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
          aws: {
            key: 'key',
            secret: 'secret',
            sign_version: 4,
            foo: 'bar'
          },
          headers:{}
        }).then( response => {
          done(response);
        }).catch( error => {
          try {
            assert.include( error.toString(), 'Error: Invalid aws options: foo' );
            done();
          }
          catch(err) {
            done(err);
          }
        } );
      } catch (err) {
        done( err );
      }
    });
  });

  describe('doRequestRetry', () => {
    it('should handle GET with one retry', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning 500 first, then 200
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(500, testPayload)
        .get('/testEndpoint')
        .reply(200, testPayload);

      try {
        // Make request max ONE attampt, verify response is 500
        RequestLib.doRequestRetry({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
          maxAttempts: 1,
          retryDelay: 1
        }).then( response => {
          assert.equal( response.statusCode, 500 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          done( error );
        } );
      } catch (err) {
        done( err );
      }
    });
    it('should handle GET with two retries', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning 500 first, then 200
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(500, testPayload)
        .get('/testEndpoint')
        .reply(200, testPayload);

      try {
        // Make request max TWO attampts, verify response is 200
        RequestLib.doRequestRetry({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
          maxAttempts: 2,
          retryDelay: 1
        }).then( response => {
          assert.equal( response.statusCode, 200 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          done( error );
        } );
      } catch (err) {
        done( err );
      }
    });
  });

});
