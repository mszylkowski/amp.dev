/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const express = require('express');
const {join} = require('path');
const config = require('@lib/config');
const HttpProxy = require('http-proxy');
const log = require('@lib/utils/log')('Thumbor');

const SECURITY_KEY = 'unsafe';

const proxyOptions = {
  target: config.hosts.thumbor.base,
  changeOrigin: true,
};
const proxy = HttpProxy.createProxyServer(proxyOptions);

// eslint-disable-next-line new-cap
const thumborRouter = express.Router();

const imagePaths = config.shared.thumbor.fileExtensions.map((extension) => {
  return join('/static/', '/**/', `*.${extension}`);
});

thumborRouter.get(imagePaths, (request, response, next) => {
  const imageUrl = new URL(request.url, config.hosts.platform.base);
  const imageWidth = imageUrl.searchParams.get('width');

  // Thumbor requests the image itself - to prevent loops it does
  // so by setting ?original=true
  if (imageUrl.searchParams.get('original')) {
    next();
    return;
  }

  const thumborUrl = new URL(request.url, config.hosts.platform.base);
  thumborUrl.pathname =
    SECURITY_KEY +
    (imageWidth ? `/${imageWidth}x0/` : '/') +
    `${imageUrl.pathname}?original=true`;
  request.url = thumborUrl.href;

  proxy.web(request, response, proxyOptions, (error) => {
    // Silently fail over if no thumbor instance can be reached. Therefore
    // rewrite the URL back to the original one
    if (error.code == 'ECONNREFUSED') {
      request.url = imageUrl.href;
      next();
      return;
    }

    // Everything else is considered a error: malformed URLs,
    // unavailable assets, ...
    log.error(error);
    response.status(502).end();
  });
});

module.exports = thumborRouter;
