'use strict';

const {join} = require('path');
const compose = require('compose-function');
const sequence = require('promise-compose');
const outdent = require('outdent');
const {test, layer, fs, env, cwd} = require('test-my-cli');

const {trim} = require('../lib/util');
const {withCacheBase} = require('../lib/higher-order');
const {testDefault, testAbsolute, testDebug, testKeepQuery, testWithLabel} = require('./common/tests');
const {buildDevNormal, buildDevNoUrl, buildProdNormal, buildProdNoUrl, buildProdNoDevtool} = require('./common/builds');
const {moduleNotFound} = require('./common/partials');
const {
  onlyMeta, assertWebpackOk, assertNoErrors, assertNoMessages, assertContent, assertSourceMapComment,
  assertSourceMapContent, assertNoSourceMap, assertAssetUrls, assertAssetFiles
} = require('../lib/assert');

const assertContentDev = compose(assertContent(/;\s*}/g, ';\n}'), outdent)`
  .some-class-name {
    single-quoted: url($0);
    double-quoted: url($1);
    unquoted: url($2);
    query: url($3);
    hash: url($4);
  }
  
  .another-class-name {
    display: block;
  }
  `;

const assertSourcemapDev = sequence(
  assertSourceMapComment(true),
  assertSourceMapContent(({meta: {engine}}) => {
    switch (true) {
      case (engine === 'rework'):
        return outdent`
          /src/feature/index.scss
            1:1
            2:3
            3:3
            4:3
            5:3
            6:3
          
          /src/index.scss
            2:1->9:1
            3:3->10:3
            7:2
            11:2
          `;
      case (engine === 'postcss'):
        return outdent`
          /src/feature/index.scss
            1:1
            2:3 2:40->2:41
            3:3 3:40->3:41
            4:3 4:33->4:34
            5:3 5:36->5:37
            6:3 6:34->6:35
          
          /src/index.scss
            2:1->8:1
            3:3->9:3 3:17->9:18
          `;
      default:
        throw new Error('unexpected test configuration');
    }
  })
);

const assertContentProd = compose(assertContent(), trim)`
  .some-class-name{single-quoted:url($0);double-quoted:url($1);unquoted:url($2);query:url($3);hash:url($4)}
  .another-class-name{display:block}
  `;

const assertSourcemapProd = sequence(
  onlyMeta('meta.version.webpack < 4')(
    assertSourceMapComment(true)
  ),
  onlyMeta('meta.version.webpack >= 4')(
    assertSourceMapComment(false)
  ),
  assertSourceMapContent(({meta: {engine, version: {webpack}}}) => {
    switch (true) {
      case (engine === 'rework') && (webpack < 4):
        return outdent`
          /src/feature/index.scss
            1:1
            2:3->1:18
            3:3->1:55
            4:3->1:92
            5:3->1:122
            6:3->1:155
          
          /src/index.scss
            3:3->1:206
            7:2->1:186
          `;
      case (engine === 'rework') && (webpack === 4):
        return outdent`
          /src/feature/index.scss
            1:1
            2:3->1:18 2:3->1:55
            3:3->1:55 3:3->1:92
            4:3->1:92 4:3->1:122
            5:3->1:122 5:3->1:155
            6:3->1:155 6:3->1:185
          
          /src/index.scss
            2:1->1:186
            3:3->1:206 3:3->1:219
            7:2->1:186
            11:2->1:220
          `;
      case (engine === 'postcss') && (webpack < 4):
        return outdent`
          /src/feature/index.scss
            1:1
            2:3->1:18
            3:3->1:55
            4:3->1:92
            5:3->1:122
            6:3->1:155 6:34->1:185
          
          /src/index.scss
            2:1->1:186
            3:3->1:206 3:17->1:219
          `;
      case (engine === 'postcss') && (webpack === 4):
        return outdent`
          /src/feature/index.scss
            1:1
            2:3->1:18
            3:3->1:55
            4:3->1:92
            5:3->1:122
            6:3->1:155 6:34->1:185
          
          /src/index.scss
            2:1->1:186
            3:3->1:206 3:17->1:219 3:17->1:220
          `;
      default:
        throw new Error('unexpected test configuration');
    }
  })
);

const assertSourceMapSources = assertSourceMapContent([
  '/src/feature/index.scss',
  '/src/index.scss'
]);

module.exports = test(
  'module-relative-asset',
  layer('module-relative-asset')(
    cwd('.'),
    fs({
      'package.json': withCacheBase('package.json'),
      'webpack.config.js': withCacheBase('webpack.config.js'),
      'node_modules': withCacheBase('node_modules'),
      'src/index.scss': outdent`
        @import "feature/index.scss";
        .another-class-name {
          display: block;
        }
        `,
      'src/feature/index.scss': outdent`
        .some-class-name {
          single-quoted: url('~images/img.jpg');
          double-quoted: url("~images/img.jpg");
          unquoted: url(~images/img.jpg);
          query: url(~images/img.jpg?query);
          hash: url(~images/img.jpg#hash);
        }
        `
    }),
    env({
      ENTRY: join('src', 'index.scss')
    }),
    testWithLabel('asset-missing')(
      moduleNotFound
    ),
    layer()(
      fs({
        'modules/images/img.jpg': require.resolve('./assets/blank.jpg')
      }),
      testDefault(
        buildDevNormal(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentDev,
          assertSourceMapSources,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        ),
        buildDevNoUrl(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentDev,
          assertSourcemapDev,
          assertAssetUrls([
            '~images/img.jpg',
            '~images/img.jpg?query',
            '~images/img.jpg#hash'
          ]),
          assertAssetFiles(false)
        ),
        buildProdNormal(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertSourceMapSources,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        ),
        buildProdNoUrl(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertSourcemapProd,
          assertAssetUrls([
            '~images/img.jpg',
            '~images/img.jpg?query',
            '~images/img.jpg#hash'
          ]),
          assertAssetFiles(false)
        ),
        buildProdNoDevtool(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertNoSourceMap,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        )
      ),
      testAbsolute(
        buildDevNormal(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentDev,
          assertSourceMapSources,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        ),
        buildDevNoUrl(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentDev,
          assertSourceMapSources,
          assertAssetUrls([
            '~images/img.jpg',
            '~images/img.jpg?query',
            '~images/img.jpg#hash'
          ]),
          assertAssetFiles(false)
        ),
        buildProdNormal(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertSourceMapSources,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        ),
        buildProdNoUrl(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertSourceMapSources,
          assertAssetUrls([
            '~images/img.jpg',
            '~images/img.jpg?query',
            '~images/img.jpg#hash'
          ]),
          assertAssetFiles(false)
        ),
        buildProdNoDevtool(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertNoSourceMap,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        )
      ),
      testDebug(
        buildDevNormal(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentDev,
          assertSourceMapSources,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        ),
        buildDevNoUrl(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentDev,
          assertSourceMapSources,
          assertAssetUrls([
            '~images/img.jpg',
            '~images/img.jpg?query',
            '~images/img.jpg#hash'
          ]),
          assertAssetFiles(false)
        ),
        buildProdNormal(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertSourceMapSources,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        ),
        buildProdNoUrl(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertSourceMapSources,
          assertAssetUrls([
            '~images/img.jpg',
            '~images/img.jpg?query',
            '~images/img.jpg#hash'
          ]),
          assertAssetFiles(false)
        ),
        buildProdNoDevtool(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertNoSourceMap,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        )
      ),
      testKeepQuery(
        buildDevNormal(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentDev,
          assertSourceMapSources,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        ),
        buildDevNoUrl(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentDev,
          assertSourceMapSources,
          assertAssetUrls([
            '~images/img.jpg',
            '~images/img.jpg?query',
            '~images/img.jpg#hash'
          ]),
          assertAssetFiles(false)
        ),
        buildProdNormal(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertSourceMapSources,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        ),
        buildProdNoUrl(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertSourceMapSources,
          assertAssetUrls([
            '~images/img.jpg',
            '~images/img.jpg?query',
            '~images/img.jpg#hash'
          ]),
          assertAssetFiles(false)
        ),
        buildProdNoDevtool(
          assertWebpackOk,
          assertNoErrors,
          assertNoMessages,
          assertContentProd,
          assertNoSourceMap,
          assertAssetUrls([
            'd68e763c825dc0e388929ae1b375ce18.jpg',
            'd68e763c825dc0e388929ae1b375ce18.jpg#hash'
          ]),
          assertAssetFiles(['d68e763c825dc0e388929ae1b375ce18.jpg'])
        )
      )
    )
  )
);
