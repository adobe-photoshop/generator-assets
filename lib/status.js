/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
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

    var STATE_IDLE = "idle",
        STATE_ACTIVE = "active";

    var _state = STATE_IDLE,
        _activeDeferreds = [],
        _idleDeferreds = [];

    function whenActive() {
        var deferred = Q.defer();

        if (_state === STATE_ACTIVE) {
            deferred.resolve();
        } else {
            _activeDeferreds.push(deferred);
        }

        return deferred.promise;
    }

    function whenIdle() {
        var deferred = Q.defer();

        if (_state === STATE_IDLE) {
            deferred.resolve();
        } else {
            _idleDeferreds.push(deferred);
        }

        return deferred.promise;
    }

    function goActive() {
        console.log("GOING ACTIVE -- CALLED");
        if (_state !== STATE_ACTIVE) {
            console.log("GOING ACTIVE -- ACTUALLY");
            _state = STATE_ACTIVE;
            _activeDeferreds.forEach(function (d) {
                d.resolve();
            });
            _activeDeferreds = [];
        }
    }

    function goIdle() {
        console.log("GOING IDLE -- CALLED");
        if (_state !== STATE_IDLE) {
            console.log("GOING IDLE -- ACTUALLY");
            _state = STATE_IDLE;
            _idleDeferreds.forEach(function (d) {
                d.resolve();
            });
            _idleDeferreds = [];
        }
    }

    Object.defineProperty(exports, "state", {
        enumerable: true,
        configurable: false,
        get: function () { return _state; }
    });

    exports.whenActive = whenActive;
    exports.whenIdle = whenIdle;
    exports._goActive = goActive;
    exports._goIdle = goIdle;

}());