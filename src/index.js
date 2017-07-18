const spdy = require('spdy');
const path = require('path');
const fs = require('fs');

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
  pathToPackageJSON = './package.json', 
  opts = { debug: false, port: 3443 }
) {
  const deferred = {};
  const file = p => fs.readFileSync(p).toString();
  const dbg = Debug.bind(global, opts);
  const env = process.env.NODE_ENV || 'development';
  let secureServer;
  let sslCert;
  let port = opts.port;
  let pkg;
  
  if (/\bObject\b/.test(Object.prototype.toString.apply(pathToPackageJSON))) {
    pkg = pathToPackageJSON;
  }
  else {
    pkg = require(path.resolve(pathToPackageJSON));
  }
  
  if (process.env.SSL_PORT)     port = process.env.SSL_PORT;
  if (process.env.SSLPORT)      port = process.env.SSLPORT;
  if (process.env.SECURE_PORT)  port = process.env.SECURE_PORT;
  
  // elevate the port to 443 if in production and if not overriden elsewhere
  if (port === 3443 && /prod(uction)/i.test(env)) port = 443;
  
  // create a deferred promise to return. This allows us to resolve or reject 
  // later in the code and immediately return the promise. Modeled after jQuery
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  
  if (pkg.certs) {
    try {
      for (let environment in pkg.certs) {
        let { cert, key } = pkg.certs[environment];

        if (!new RegExp(environment, 'i').test(env)) continue;
        if (!fs.existsSync(path.resolve(cert))) continue;
        if (!fs.existsSync(path.resolve(key))) continue;

        sslCert = {
          cert: file(cert),
          key: file(key)
        };

        secureServer = spdy
          .createServer(sslCert, app)
          .listen(port, error => {
            if (error) {
              deferred.reject(error);
            }
            deferred.resolve(secureServer);
          });

        break;
      }

      if (!sslCert) {
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
    `));
  }
  
  dbg('');
  dbg(`[Environment ] ${env}`);
  dbg(`[Production  ] ${/prod(uction)/i.test(env)}`);
  deferred.promise
    .then((secureServer) => {      
      if (!secureServer) {
        dbg(`[HTTP/2      ] disabled`)
      }
      else {
        dbg(`[HTTP/2 Port ] https://127.0.0.1:${port}`);
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
  
  default: {
    EzSpdy,
    Debug
  }
};