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

//COMPARE const fs = require('fs-extra');
//COMPARE const request = require('request');
//COMPARE const requestPromiseNative = require('request-promise-native');
//COMPARE const requestTriggerFile = 'USE_LEGACY_REQUEST_LIBRARY';

const axios = require('axios');
const Https = require('https');
const Stream = require('stream');
const merge = require('deepmerge');
const bunyan = require('bunyan');

const defaultLogger = (() => {
  try {
    return bunyan.createLogger({
      name: 'Request-util.request',
      streams: [{
        level: (process.env.LOG_LEVEL || 'info'),
        stream: process.stdout // log LOG_LEVEL and above to stdout
      }],
      serializers: bunyan.stdSerializers
    });
  } catch (err) {
    // unknown log level given, default to info
    return bunyan.createLogger({
      name: 'Request-util.request',
      streams: [{
        level: ('info'),
        stream: process.stdout // log level and above to stdout
      }],
      serializers: bunyan.stdSerializers
    });
  }
})();

const allowedRequestOptions = [
  'method',                   // No conversion
  'baseUrl',                  // -> baseURL
  'uri',                      // -> url
  'url',                      // No conversion
  'headers',                  // No conversion (but some addition as necesssary)
  'qs',                       // -> params
  'body',                     // -> data
  'form',                     // -> data
  'json',                     // -> data (if used as payload) or -> headers (if used to indicate payload/response type)
  'simple',                   // -> whether to error/reject if not 2xx response
  'resolveWithFullResponse',  // -> whether to resolve with just the response payload or the full response (ONLY `statusCode` and `body` should be used)
  'timeout',                  // No conversion
  'agent',                    // No conversion
  'ca',                       // -> Https.Agent
  'cert',                     // -> Https.Agent
  'key',                      // -> Https.Agent
  'encoding',                 // -> whether to handle response payload as binary (`encoding=null` only expected value)
];

function requestOpts_to_axiosOpts( requestOptions, logger=defaultLogger ) {
  const invalidRequestOptions = Object.getOwnPropertyNames( requestOptions ).filter( n => !allowedRequestOptions.includes( n ) );
  if( invalidRequestOptions.length > 0 ) {
    logger.error( `Unsupported request options could not be converted to axios options: ${invalidRequestOptions.join(',')}` );
    throw new Error( `Invalid request options: ${invalidRequestOptions.join(',')}` );
  }

  // Clone requestOptions (so it is not accidentally modified), set default method (not strictly necessary as `get` is axios default)
  const axiosOptions = merge( {
    method: 'get',
  }, requestOptions );

  // uri -> url
  if( axiosOptions.uri ) {
    axiosOptions.url = axiosOptions.uri;
    delete axiosOptions.uri;
  }

  // baseUrl -> baseURL
  if( axiosOptions.baseUrl ) {
    axiosOptions.baseURL = axiosOptions.baseUrl;
    delete axiosOptions.baseUrl;
  }
  
  // qs -> params
  if( axiosOptions.qs ) {
    axiosOptions.params = axiosOptions.qs;
    delete axiosOptions.qs;
  }

  if( ['POST','PUT','PATCH'].includes( axiosOptions.method.toUpperCase() ) ) {
    // body -> data
    if( axiosOptions.body ) {
      axiosOptions.data = axiosOptions.body;
      delete axiosOptions.body;
      // It is allowable with the `request` library to POST with both `body` and `json` (body as payload, json as boolean indicating payload type)
      // or with just `json` (json as payload), hence else/if structure checking for `body` first.
      if( axiosOptions.json ) {
        axiosOptions.headers = merge( axiosOptions.headers, {'Content-Type': 'application/json'} );
      }
      else {
        axiosOptions.headers = merge( axiosOptions.headers, {'Content-Type': 'text/plain'} );
      }
    }
    // form -> data
    else if( axiosOptions.form ) {
      axiosOptions.data = axiosOptions.form;
      delete axiosOptions.form;
      axiosOptions.headers = merge( axiosOptions.headers || {}, { 'Content-Type': 'application/x-www-form-urlencoded' } );
    }
    // json -> data
    else if( axiosOptions.json ) {
      axiosOptions.data = axiosOptions.json;
      delete axiosOptions.json;
      axiosOptions.headers = merge( axiosOptions.headers, {'Content-Type': 'application/json'} );
    }

    // PUT/POST/PATCH/DELETE response is expected to be json
  }
  else {
    // Axios parses JSON response by default
    if( !axiosOptions.json ) {
      axiosOptions.responseType = 'text';
    }
    delete axiosOptions.json;
  }

  // If not 'simple', dont throw an error if response code is not 2xx
  if( !axiosOptions.simple ) {
    axiosOptions.validateStatus = null;
  }
  delete axiosOptions.simple;

  // Axios always returns full response
  if( !axiosOptions.resolveWithFullResponse ) {
    // When returning the response, this module must return only response.data (aka response.body)
  }
  delete axiosOptions.resolveWithFullResponse;

  if( axiosOptions.encoding === null ) {
    axiosOptions.responseType = 'arraybuffer';
    // When returning the response, this module must convert data with `Buffer.from(res.data, 'binary')`
  }
  delete axiosOptions.encoding;

  // HTTP/HTTPS agent options
  if( axiosOptions.agent ) {
    if (axiosOptions.url.startsWith('https')) {
      axiosOptions.httpsAgent = axiosOptions.agent;
    } else {
      axiosOptions.httpAgent = axiosOptions.agent;
    }
  }
  else if( axiosOptions.ca || axiosOptions.key || axiosOptions.cert ) {
    const agentOptions = {};
    if( axiosOptions.ca ) {
      agentOptions.ca = axiosOptions.ca;
    }
    if( axiosOptions.cert ) {
      agentOptions.cert = axiosOptions.cert;
    }
    if( axiosOptions.key ) {
      agentOptions.key = axiosOptions.key;
    }
    axiosOptions.httpsAgent = new Https.Agent(agentOptions);
  }
  delete axiosOptions.agent;
  delete axiosOptions.ca;
  delete axiosOptions.cert;
  delete axiosOptions.key;

  return axiosOptions;
}

function axiosResponse_to_requestResponse( requestOptions, axiosResponse ) {
  // Avoid deepmerge clone of response object
  const requestResponse = axiosResponse;

  // status -> statusCode
  requestResponse.statusCode = requestResponse.status;
  delete requestResponse.status;

  // statusText -> statusMessage
  requestResponse.statusMessage = requestResponse.statusText;
  delete requestResponse.statusText;
  
  // data -> body
  if( requestOptions.encoding === null ) {
    requestResponse.body = Buffer.from(requestResponse.data, 'binary'); // File download
  }
  else {
    requestResponse.body = requestResponse.data;
  }
  delete requestResponse.data;

  // Return full response (with statusCode etc) or just the payload
  return( requestOptions.resolveWithFullResponse ? requestResponse : requestResponse.body );
}

function getStream( requestOptions, logger=defaultLogger ) {
  //COMPARE const useLegacyRequest = fs.pathExistsSync(`./${requestTriggerFile}`);
  //COMPARE if( useLegacyRequest ) {
  //COMPARE   return request( requestOptions );
  //COMPARE }

  const axiosStream = new Stream.PassThrough();

  const axiosOptions = requestOpts_to_axiosOpts( requestOptions, logger );
  axiosOptions.responseType = 'stream';

  // Ensure stream can be aborted in same way as `request` library stream
  const abortController = new AbortController();
  axiosStream.abort = () => {
    logger.info( `Stream from ${axiosOptions.url} aborting` );
    return abortController.abort();
  };
  axiosOptions.signal = abortController.signal;

  // Start the axios request
  logger.info( `Stream from ${axiosOptions.url} starting` );
  axios( axiosOptions ).then( (axiosResponse) => {
    // Emit a `response` event on connection like `request` library
    const requestResponse = axiosResponse_to_requestResponse( requestOptions, axiosResponse );
    axiosStream.emit( 'response', requestResponse );
    
    // Send all data from the response to the axios stream
    // Use `Stream.pipeline` -- `Stream.pipe` will not pass error events or ensure that all streams are destroyed on completion.
    Stream.pipeline(
      requestResponse.body,
      axiosStream,
      (err) => {
        logger.info( `Stream from ${axiosOptions.url} completed, error: ${err}` );
      }
    );
  } );

  // Return the axios stream without waiting for request
  return axiosStream;
}

// Do a request with `request` library options
async function doRequest( requestOptions, logger=defaultLogger ) {
  //COMPARE const useLegacyRequest = await fs.pathExists(`./${requestTriggerFile}`);
  //COMPARE if( useLegacyRequest ) {
  //COMPARE   return await requestPromiseNative( requestOptions );
  //COMPARE }

  const axiosOptions = requestOpts_to_axiosOpts( requestOptions, logger );
  const axiosResponse = await axios( axiosOptions );
  const requestResponse = axiosResponse_to_requestResponse( requestOptions, axiosResponse );
  return( requestResponse );
}

module.exports = {
  getStream,
  doRequest
};
