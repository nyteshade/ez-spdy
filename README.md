# ez-spdy

An easy and less complicated way to integrate HTTP/2 via Spdy and Express

## Overview

EzSpdy came into existence because I got tired of writing the same code over and over. Typically how these things happen. The point of it is to simply read the location of SSL certs from the package.json file for a given Express app.

It allows the easy definition of SSL cert locations based upon `NODE_ENV` environmental variable settings. If no `NODE_ENV` variable is defined the system defaults to `development`, therefore it is wise to define at least this and `prod` or `production`. While EzSpdy performs case insensitive matching to these keys, most applications and modules will expect them to follow this lowercase convention as well as the more verbose of the names. So use `production` and `development`, rather than `prod` and `dev` whenever possible.

## Installation

Make sure you have Node 6 or greater, earlier versions might work but haven't been tested. Then in a shell, within your project, enter the following.

```sh
npm install --save ez-spdy
```

## API

EzSpdy takes an Express instance, `expressApp`, presumably your primary express app instance, as the first parameter. Effort has been taken to not verify this property so that any valid listener allowed by spdy.createServer is allowed. See <https://github.com/spdy-http2/node-spdy#api> for more details on this.

`opts`, the second parameter is an optional object wherein you can specify options to change the execution of EzSpdy.

The third parameter, `pathToPackageJSON`, is the path to the package.json where your various SSL cert paths for each environment are stored. EzSpdy expects an object with a key for each environment string, tested against NODE_ENV in a case insensitive manner, is mapped to an object with a "cert" and a "key" properties.

Optionally, if you have already `require`'d the package.json file, you may pass in the object itself instead of the path string.

"cert" and "key" should be filesystem paths to the associated files. Many SSL certs have inconsistent file extensions. The "cert" is a certificate file and "key" is your private key file. If you are using a Macintosh and have only a .p12 or bundled .pfx file, i.e. a certificate that has an encoded cert and key file within, you can use KeyCertExtractor to extract these easily. You can download a version here: <https://goo.gl/W6ZFJm>. The repo hosting this app is <https://github.com/nyteshade/KeyCertExtractor>.

- `debug` this key denotes a boolean that, when true, will cause output to be written to stdout via console.info.
- `port` by default this will be 3443 unless `NODE_ENV` is set to `prod` or `production`; in which case, if not otherwise defined, it will be set to 443\. To override this, set the port in opts or set it via ENV variables in any of the following properties; `SSL_PORT`, `SSLPORT` or `SECURE_PORT`
- `onListening` if this is a falsey value, an internal representation will be used. The first parameter passed along that is the internal will be a function that, if called, will display the normal output for debug mode. The second parameter will be either the error, `spdy` server instance or `null` if there was no cert matching the `NODE_ENV` value. NOTE that if no `NODE_ENV` value is provided, `development` is the value being searched for in `package.json`.

### Usage

To use in your node.js application, simply `import` it in ES6 environments or pick the property via `require` in ES5 and below environments.

```javascript
// ES5
const EzSpdy = require('ez-spdy').EzSpdy;
// ...or...
const EzSpdy = require('ez-spdy').default;

// ES6
import { EzSpdy } from 'ez-spdy'
// ...or...
import EzSpdy from 'ez-spdy'
```

Once the import/require has been performed, simply call it with your Express 4.x app instance or appropriate listener function (See <https://github.com/spdy-http2/node-spdy#api>).

```javascript
// Default example using Express
const EzSpdy = require('ez-spdy').EzSpdy;
const Express = require('express');
const app = Express();
// configure app
const promise = EzSpdy(app);
```

### See output

In order to see output once the server instance is listening or if an error has occurred, replace the last line with something like this

```javascript
const promise = EzSpdy(app, {debug: true});
```

Output will look something like this

```sh
[Environment ] production
[Production  ] true
[HTTP/2 URL  ] https://machinename.company.com:3443
```

### Adjust SSL port

You can also configure the specified port via environmental variables or by passing a port property to the options. So during startup, perhaps something like

```sh
SSL_PORT=8443 node .

# Both of the following would also work:
# SSLPORT=8443 node .
# SECURE_PORT=8443 node .
```

In code, this can be specified by replacing the call with something like

```javascript
const promise = EzSpdy(app, {port: 8443})
```

### OnListening

When `{debug: true}` is set in the options, output will be logged to `console.info()`. If you wish to write some code that occurs when the server is listening or an error has occurred, you can do so by supplying a function for the key `onListening` in your options. It has the syntax of:

```javascript
function onListeningFn(logOutput: Function, result: Error|HttpsServer|null): void
```

If `result` is `null` then it means that no matching environment, or `development` could be found under the key "certs" in package.json. If the result is an `Error` instance, inspect it normally to determine what has happened. Finally, if all is well and the result is neither Error nor null, then the server has successfully launched. The resulting object is the result of `Spdy.createServer()`.

```javascript
const promise = EzSpdy(app, {onListening: function(logOutput, result) {
  // Show the output 
  logOutput();

  // Do something if there was no matching config 
  if (result === null) {

  }

  // Do something if there was an error 
  else if (/Error/.test(Object.prototype.toString.call(result))) {

  }

  // Otherwise success 
  else {

  }
}});
```

### Async/Await

Because `EzSpdy` returns a promise, you can use it in your async/await code.

```javascript
const httpsServer = await EzSpdy(app, {port: 443, debug: true});

// Optionally do something with result; alternate result detection
// The weird typeOf function simply calls Object.prototype.toString() 
// with a different object as the `this`. This produces accurate type 
// info such as [object Error] or errors or [object Null] for null. 
// Several libraries out there make this easier to read.
const typeOf = o => ({}).toString.call(o).replace(/\[\w+ (\w+)\]/,'$1');
switch (typeOf(httpsServer)) {
  'Error':
    // error
    break;
  'Null': 
    // no matching config
    break;
  default:
    // success
    break;
}
```

## Example `package.json` cert values

ez-spdy expects there to be a "certs" key in the package.json root. This should be equivalent to the name of the environment for which you are supplying options. A nice trick to this is to name the environments after your hostname. This makes it easy for you to have startup scripts and setups like the following:

```json
{
  "main": "src/index.js",
  "scripts": {
    "start": "NODE_ENV=$(hostname -f) node ."
  },
  "certs": {
    "homeComputer.local": {
      "cert": "certs/home.development.cert",
      "key": "certs/home.development.pkey"
    },
    "work.company.com": {
      "cert": "certs/work.company.com.cert",
      "key": "certs/work.company.com.pkey"
    },
    "production": {
      "cert": "certs/production.cert",
      "key": "certs/production.pkey"
    }
  }
}
```

**NOTE** Do not check in unencrypted private key files to a public GitHub repo. A pro tip is to encrypt them using `openssl` and decrypt them after checkout. Here's how. This uses encryption strong enough for the government.

```sh
# To decrypt
openssl enc -d -aes-256-cbc -in encrypted.key -out decrypted.key

# To encrypt
openssl enc -salt -aes-256-cbc -in decrypted.key -out encrypted.key
```

You can even add this as a script to make it easier for those downloading the repo. Add something like this to your package.json file.

```json
{
  "scripts": {
    "decrypt": "openssl enc -d -aes-256-cbc -in certs/production.key.enc -out certs/production.key"
  },
  "certs": {
    "production": {
      "cert": "certs/production.cert",
      "key": "certs/production.key"
    }
  }
}
```
