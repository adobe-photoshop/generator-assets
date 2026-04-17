/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

(function () {
    "use strict";

    var Q = require("q");

    var AssetManager = require("../lib/assetmanager");

    function makeAssetManager(config, renderManager, loggerOverrides) {
        var generator = {},
            document = { id: 1 },
            logger = {
                warn: function () {},
                error: function () {},
                info: function () {}
            },
            key;
        if (loggerOverrides) {
            for (key in loggerOverrides) {
                if (loggerOverrides.hasOwnProperty(key)) {
                    logger[key] = loggerOverrides[key];
                }
            }
        }
        var am = new AssetManager(generator, config || {}, logger, document, renderManager);

        am._fileManager.moveFileInto = function () {
            var d = Q.defer();
            d.resolve();
            return d.promise;
        };

        am._renderPromises = {};
        am._filePromises = [];

        return am;
    }

    function whenIdle(am, fn) {
        am.once("idle", fn);
    }

    /**
     * Baseline: without render-retry logic, a failed render invokes RenderManager.render once.
     */
    exports.testRequestRenderCallsRenderOnceOnFailure = function (test) {
        var calls = 0;
        var mockRM = {
            render: function () {
                calls++;
                return Q.reject(new Error("fail"));
            }
        };

        var am = makeAssetManager({}, mockRM);

        whenIdle(am, function () {
            test.strictEqual(calls, 1);
            test.done();
        });

        am._requestRender({ id: "c0", assetPath: "x.png", extension: "png" });
    };

    // Render retry suite (runAttempt, render-retry-max, render-retry-delay-ms, zeroBoundsError, cancel)

    exports.testRetrySucceedsAfterTransientFailures = function (test) {
        var calls = 0;
        var mockRM = {
            render: function () {
                calls++;
                if (calls < 3) {
                    return Q.reject(new Error("transient"));
                }
                return Q.resolve({ path: "/tmp/asset.png", errors: [] });
            }
        };

        var am = makeAssetManager({ "render-retry-max": 2, "render-retry-delay-ms": 0 }, mockRM);

        whenIdle(am, function () {
            test.strictEqual(calls, 3, "two failures then success should call render three times");
            test.done();
        });

        am._requestRender({ id: "c1", assetPath: "out.png", extension: "png" });
    };

    exports.testRetryLogsWarnBeforeEachRetry = function (test) {
        var calls = 0;
        var warns = [];
        var mockRM = {
            render: function () {
                calls++;
                if (calls < 3) {
                    return Q.reject(new Error("transient"));
                }
                return Q.resolve({ path: "/tmp/asset.png", errors: [] });
            }
        };

        var am = makeAssetManager(
            { "render-retry-max": 2, "render-retry-delay-ms": 0 },
            mockRM,
            {
                warn: function () {
                    warns.push(Array.prototype.slice.call(arguments));
                }
            }
        );

        whenIdle(am, function () {
            test.strictEqual(warns.length, 2, "one warn before each retry");
            test.strictEqual(warns[0][0], "Render attempt %d of %d failed for %s: %s; retrying");
            test.strictEqual(warns[0][1], 1);
            test.strictEqual(warns[0][2], 3);
            test.strictEqual(warns[0][3], "out.png");
            test.strictEqual(warns[0][4], "transient");
            test.strictEqual(warns[1][1], 2);
            test.strictEqual(warns[1][2], 3);
            test.strictEqual(warns[1][4], "transient");
            test.done();
        });

        am._requestRender({ id: "c1b", assetPath: "out.png", extension: "png" });
    };

    exports.testNoRetryWhenMaxIsZero = function (test) {
        var calls = 0;
        var mockRM = {
            render: function () {
                calls++;
                return Q.reject(new Error("fail"));
            }
        };

        var am = makeAssetManager({ "render-retry-max": 0 }, mockRM);

        whenIdle(am, function () {
            test.strictEqual(calls, 1);
            test.done();
        });

        am._requestRender({ id: "c2", assetPath: "a.png", extension: "png" });
    };

    exports.testRetriesExhausted = function (test) {
        var calls = 0;
        var mockRM = {
            render: function () {
                calls++;
                return Q.reject(new Error("always fails"));
            }
        };

        var am = makeAssetManager({ "render-retry-max": 2, "render-retry-delay-ms": 0 }, mockRM);

        whenIdle(am, function () {
            test.strictEqual(calls, 3, "initial try plus two retries");
            test.done();
        });

        am._requestRender({ id: "c3", assetPath: "b.png", extension: "png" });
    };

    exports.testNoRetryOnZeroBoundsError = function (test) {
        var calls = 0;
        var mockRM = {
            render: function () {
                calls++;
                var err = new Error("zero bounds");
                err.zeroBoundsError = true;
                return Q.reject(err);
            }
        };

        var am = makeAssetManager({ "render-retry-max": 5, "render-retry-delay-ms": 0 }, mockRM);

        whenIdle(am, function () {
            test.strictEqual(calls, 1);
            test.done();
        });

        am._requestRender({ id: "c4", assetPath: "c.png", extension: "png" });
    };

    exports.testNoRetryOnCancel = function (test) {
        var calls = 0;
        var mockRM = {
            render: function () {
                calls++;
                var d = Q.defer();
                d.reject();
                return d.promise;
            }
        };

        var am = makeAssetManager({ "render-retry-max": 5, "render-retry-delay-ms": 0 }, mockRM);

        whenIdle(am, function () {
            test.strictEqual(calls, 1);
            test.done();
        });

        am._requestRender({ id: "c5", assetPath: "d.png", extension: "png" });
    };

    exports.testRenderRetryMaxConfigCap = function (test) {
        var mockRM = { render: function () { return Q.resolve({ path: "/t", errors: [] }); } };
        var am = makeAssetManager({ "render-retry-max": 9999 }, mockRM);
        test.strictEqual(am._getRenderRetryMax(), 20);
        test.done();
    };

    exports.testRetryBackoffDefaultMultiplierEqualDelays = function (test) {
        var mockRM = { render: function () { return Q.resolve({ path: "/t", errors: [] }); } };
        var am = makeAssetManager({ "render-retry-delay-ms": 50 }, mockRM);
        test.strictEqual(am._getRetryWaitMsAfterFailure(1), 50);
        test.strictEqual(am._getRetryWaitMsAfterFailure(2), 50);
        test.done();
    };

    exports.testRetryBackoffMultiplierExponential = function (test) {
        var mockRM = { render: function () { return Q.resolve({ path: "/t", errors: [] }); } };
        var am = makeAssetManager({
            "render-retry-delay-ms": 100,
            "render-retry-backoff-multiplier": 2
        }, mockRM);
        test.strictEqual(am._getRetryWaitMsAfterFailure(1), 100);
        test.strictEqual(am._getRetryWaitMsAfterFailure(2), 200);
        test.strictEqual(am._getRetryWaitMsAfterFailure(3), 400);
        test.done();
    };

    exports.testRetryBackoffMaxCap = function (test) {
        var mockRM = { render: function () { return Q.resolve({ path: "/t", errors: [] }); } };
        var am = makeAssetManager({
            "render-retry-delay-ms": 1000,
            "render-retry-backoff-multiplier": 10,
            "render-retry-backoff-max-ms": 500
        }, mockRM);
        test.strictEqual(am._getRetryWaitMsAfterFailure(1), 500);
        test.strictEqual(am._getRetryWaitMsAfterFailure(2), 500);
        test.done();
    };

    exports.testRetryBackoffJitterWithMockRandom = function (test) {
        var mockRM = { render: function () { return Q.resolve({ path: "/t", errors: [] }); } };
        var am = makeAssetManager({
            "render-retry-delay-ms": 100,
            "render-retry-jitter": true
        }, mockRM);
        var orig = Math.random;
        Math.random = function () {
            return 0;
        };
        try {
            test.strictEqual(am._getRetryWaitMsAfterFailure(1), 0);
        } finally {
            Math.random = orig;
        }
        test.done();
    };

}());
