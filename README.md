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

## API and Usage

EzSpdy takes an Express instance, `expressApp`, presumably your primary express app instance, as the first parameter. Effort has been taken to not verify this property so that any valid listener allowed by spdy.createServer is allowed. See <https://github.com/spdy-http2/node-spdy#api> for more details on this.

The second parameter, `pathToPackageJSON`, is the path to the package.json where your various SSL cert paths for each environment are stored. EzSpdy expects an object with a key for each environment string, tested against NODE_ENV in a case insensitive manner, is mapped to an object with a "cert" and a "key" properties.

"cert" and "key" should be filesystem paths to the associated files. Many SSL certs have inconsistent file extensions. The "cert" is a certificate file and "key" is your private key file. If you are using a Macintosh and have only a .p12 or bundled .pfx file, i.e. a certificate that has an encoded cert and key file within, you can use KeyCertExtractor to extract these easily. You can download a version here: <https://github.com/nyteshade/KeyCertExtractor/raw/master/KeyCertExtractor.app.zip>

`opts`, the third parameter is an optional object wherein you can specify options to change the execution of EzSpdy.

- `debug` this key denotes a boolean that, when true, will cause output to be written to stdout via console.info.
- `port` by default this will be 3443 unless `NODE_ENV` is set to `prod` or `production`; in which case, if not otherwise defined, it will be set to 443\. To override this, set the port in opts or set it via ENV variables in any of the following properties; `SSL_PORT`, `SSLPORT` or `SECURE_PORT`
