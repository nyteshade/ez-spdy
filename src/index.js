const spdy = require('spdy');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns');

// Fast internal method for checking the Object.prototype.toString of an obj
function typeOf(object) { 
  return /(\b\w+\b)\]/.exec(Object.prototype.toString.call(object))[1];
}

/**
 * A deferred object, ala jQuery.deferred, that can be timed out over
 * a specific interval or delegated to a promise or immediately resolved 
 * with an object.
 * 
 * @method Pact
 * @param {Promise|mixed} promiseOrValue if a Promise object is supplied,
 * `then` is assigned to resolving the deferred with its arguments and `catch`
 * is assigned to rejecting the deferred. Otherwise, if truthy, the value is 
 * used to immediately resolve the deferred with the supplied value.
 * @param {Number} timeOut if a Number and not NaN then that value is the 
 * specified number of milliseconds before the deferred is automatically 
 * rejected.
 * @param {Boolean} resolveAfterTimeOut if truthy, and the deferred is timed 
 * out, the action taken will be a resolution instead of a rejection.
 * @constructor
 */
function Pact(promiseOrValue, timeOut, resolveAfterTimeOut) {
  const deferred = {};
  
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  
  if (typeOf(promiseOrValue) === Promise.name) {
    promiseOrValue
      .then(function() { deferred.resolve.apply(this, arguments) })
      .catch(function() { deferred.reject.apply(this, arguments) })
  }
  else if (promiseOrValue) {
    deferred.resolve(promiseOrValue);
  }
  
  if (typeOf(timeOut) === Number.name && timeOut !== NaN) {
    let op = resolveAfterTimeOut ? 'resolve' : 'reject';
    
    setTimeout(() => deferred[op](new Error(`
      The Pact was given a time out of ${timeOut}ms. That time has 
      elapsed and the Pact has had ${op}() called on it.
    `)), timeOut);
  }
  
  if (Symbol.toStringTag) {
    deferred[Symbol.toStringTag] = 'Pact';
  }
  
  return deferred;
}

/**
 * Uses the internal node bindings to fetch the fully qualified domain name 
 * of the machine on which the code is running. While the method is not 
 * async, it returns a promise so it can be used in such situations.
 * 
 * @method getFQDN
 * @return {Promise} a promise that resolves to an object containing the
 * following properties ```
 * {
 *   hostname: String, // fully qualified domain name
 *   service: String, // service as returned from dns.lookupService
 *   fqdn: String, // shorthand for fully qualified domain name
 *   uqdn: String // os.hostname()
 * }
 * ```
 */
function getFQDN() {
  const uqdn = os.hostname();
  const p = Pact();

  dns.lookup(uqdn, { hints: dns.ADDRCONFIG }, function(err, ip) {
    dns.lookupService(ip, 0, function (err, hostname, service) {
      if (err) {
        return p.reject(err);
      }
      p.resolve({hostname, service, fqdn: hostname, uqdn})
    });
  });  
  
  return p.promise;
}


/**
 * A method that wraps and conditionally logs to console.info when the option 
 * to debug is enabled. 
 * 
 * @method Debug
 * @param {Object} options options object, typically provided by a function 
 * bind wherever it is used.
 * @param {Array<mixed>} args standard options you would use with console.log, 
 * or in this case, console.info
 */
function Debug(options, ...args) {
  if (!options || !options.debug) return;
  console.info(...args);
}

/**
 * EzSpdy takes an Express instance, presumably your primary express app 
 * instance, as the first parameter. Effort has been taken to not verify this 
 * property so that any valid listener allowed by spdy.createServer is 
 * allowed. See https://github.com/spdy-http2/node-spdy#api for more details on
 * this. 
 *
 * The second parameter is the path to the package.json where your various
 * SSL cert paths for each environment are stored. EzSpdy expects an object 
 * with a key for each environment string, tested against NODE_ENV in a 
 * case insensitive manner, is mapped to an object with a "cert" and a "key"
 * properties. If you have already require()'ed your package.json into an 
 * object, you can also pass that object instead of a path to the 
 * package.json file.
 *
 * "cert" and "key" should be filesystem paths to the associated files. Many 
 * SSL certs have inconsistent file extensions. The "cert" is a certificate 
 * file and "key" is your private key file. If you are using a Macintosh and 
 * have only a .p12 or bundled .pfx file, i.e. a certificate that has an 
 * encoded cert and key file within, you can use KeyCertExtractor to extract 
 * these easily. You can download a version here: 
 * https://github.com/nyteshade/KeyCertExtractor/raw/master/KeyCertExtractor.app.zip
 *
 * opts, the third parameter is an optional object wherein you can specify 
 * options to change the execution of EzSpdy. 
 *   * `debug` this key denotes a boolean that, when true, will cause output
 *     to be written to stdout via console.info. 
 *   * `port` by default this will be 3443 unless NODE_ENV is set to 'prod' or 
 *     'production'; in which case, if not otherwise defined, it will be set to
 *     443. To override this, set the port in opts or set it via ENV variables 
 *     in any of the following properties; SSL_PORT, SSLPORT or SECURE_PORT
 * 
 * @method EzSpdy
 * @param {Express} an instance of Express that serves as your core express app
 * @param {String} [pathToPackageJSON='./package.json'] a string denoting the 
 * path to the projects package.json file.
 * @param {Object} [opts={debug: false, port: 3443}] an optional set of options
 *
 * @return {Spdy} the created Spdy server instance of null if something went
 * wrong.
 */
function EzSpdy(
  expressApp, 
  opts = { debug: false, port: 3443, package: null, env: null }
) {
  const deferred = Pact();
  const fdqnPromise = Pact(getFQDN(), 5000).promise;
  const file = p => fs.readFileSync(p).toString();
  const dbg = Debug.bind(global, opts);
  const env = opts.env || process.env.NODE_ENV || 'development';
  const pathToPackageJSON = opts.package || './package.json';
  
  let secureServer;
  let skipped = [];
  let sslCert;
  let port = opts.port;
  let pkg;
  
  if (typeOf(pathToPackageJSON) === Object.name) {
    pkg = pathToPackageJSON;
  }
  else if (typeOf(pathToPackageJSON) === String.name) {
    pkg = require(path.resolve(pathToPackageJSON));
  }
  else {
    dbg(`The type of pathToPackageJSON is ${typeOf(pathToPackageJSON)}`)
    dbg(`It's value is`, pathToPackageJSON);    
  }
  
  if (process.env.SSL_PORT)     port = process.env.SSL_PORT;
  if (process.env.SSLPORT)      port = process.env.SSLPORT;
  if (process.env.SECURE_PORT)  port = process.env.SECURE_PORT;
  
  // elevate the port to 443 if in production and if not overriden elsewhere
  if (port === 3443 && /prod(uction)/i.test(env)) port = 443;
    
  if (pkg && pkg.certs) {    
    try {
      for (let environment in pkg.certs) {
        let { cert, key } = pkg.certs[environment];

        if (!new RegExp(environment, 'i').test(env)) {
          skipped.push({
            reason: `Environment '${environment}' does not match '${env}'`,
            cert, key
          });
          continue;          
        }
        
        if (!fs.existsSync(path.resolve(cert))) {
          skipped.push({
            reason: `Cert ${path.resolve(cert)} does not exist`,
            cert, key
          });
          continue;
        }
        
        if (!fs.existsSync(path.resolve(key))) {
          skipped.push({
            reason: `Key ${path.resolve(key)} does not exist`,
            cert, key
          });
          continue;
        }

        sslCert = {
          cert: file(cert),
          key: file(key)
        };

        secureServer = spdy
          .createServer(sslCert, expressApp)
          .listen(port, error => {
            if (error) {         
              dbg('The spdy server failed to start\n')
              dbg(error);     
              deferred.reject(error);
            }
            deferred.resolve(secureServer);
          });

        break;
      }

      if (!sslCert) {
        dbg(`Tried the following and skipped them\n  ${
          skipped.map(c => 
            `Reason: ${c.reason}\n  Cert  : ${c.cert}\n  Key   : ${c.key}`
          ).join('\n\n  ')
        }`)
        deferred.resolve(null);
      }
    }
    catch (error) {
      if (error) {
        deferred.reject(error);
      }
    }
  }
  else {
    skipped.push({
      reason: `No pkg! ${(pathToPackageJSON)}`,
      cert: 'None',
      key: 'None'
    });
    
    deferred.reject(new Error(`
      In order to use EzSpdy, you will need to provide a path to a valid
      package.json file that contains an property named "certs". This should
      be an object that properties named for each environment. In the case 
      that NODE_ENV is not defined in your environment, EzSpdy will assume 
      that "development" is defined herein.
      
      Example:
      {
        "certs": {
          "development": {
            "cert": "/path/to/ssl-cert.pem",
            "key": "/path/to/ssl-cert.key"
          },          
          "production": { 
            // ... 
          },
          ...
        }
      }
      
      NOTE that "cert" and "key" take relative or absolute paths. EzSpdy will 
      open the file and pass the contents to node-spdy using options with the 
      same cert and key names. See node-spdy for more examples on what is
      accepted.
      
      The following items were attempted but skipped for their various reasons
        ${
        skipped.map(c => {
          return `Reason: ${c.reason}\n\tCert  : ${c.cert}\n\tKey   : ${c.key}`
        }).join(`\n\t`)
      }
    `));
  }
  
  dbg('');
  dbg(`[Environment ] ${env}`);
  dbg(`[Production  ] ${/prod(uction)/i.test(env)}`);
  Promise.all([deferred.promise, fdqnPromise])
    .then(([secureServer, fqdn]) => {      
      if (!secureServer) {
        dbg(`[HTTP/2      ] disabled`)
      }
      else {
        dbg(`[HTTP/2 Port ] https://${fqdn.fqdn}:${port}`);
      }
    })
    .catch((reason) => {
      dbg(`[HTTP/2      ] error occurred`);
      dbg(`[Error       ] ${reason && reason.message || reason}`)
      if (reason.stack)
        dbg(`[Stack Trace ]\n${reason && reason.stack}`)
    });
  
  return deferred.promise;
}

module.exports = {
  EzSpdy,
  Debug,
  Pact,
  typeOf,
  
  default: EzSpdy
};