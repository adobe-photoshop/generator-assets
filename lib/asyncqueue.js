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

    var events = require("events"),
        util = require("util");

    var Q = require("q");

    /**
     * A pausable queue of asynchronous operations to be executed in sequence.
     * 
     * @constructor
     */
    function AsyncQueue() {
        events.EventEmitter.call(this);
        this._pending = [];
    }

    util.inherits(AsyncQueue, events.EventEmitter);

    /**
     * A list of pending jobs.
     * 
     * @type {{fn: Array.<function(): Promise>, deferred: Deferred}}
     */
    AsyncQueue.prototype._pending = null;

    /**
     * The promise for the current executing operation, or null if the queue is
     * quiescent.
     *
     * @type {?Promise}
     */
    AsyncQueue.prototype._current = null;

    /**
     * Indicates whether or not the queue is paused; i.e., is not consuming and
     * executing additional jobs.
     * 
     * @type {boolean}
     */
    AsyncQueue.prototype._isPaused = false;

    /**
     * Add a new asynchronous operation to the queue.
     * 
     * @param {function(): Promise} fn
     */
    AsyncQueue.prototype.push = function (fn) {
        var deferred = Q.defer(),
            job = {
                fn: fn,
                deferred: deferred
            };

        this._pending.push(job);

        if (!this._current && this._pending.length === 1 && !this._isPaused) {
            this._processNext();
        }

        return deferred.promise;
    };

    /**
     * Remove all operations from the queue. Does not affect the currently executing operaiton.
     */
    AsyncQueue.prototype.removeAll = function () {
        this._pending.forEach(function (job) {
            job.deferred.reject();
        });

        this._pending.length = 0;
    };

    /**
     * Execute the next job in the queue, if any.
     * 
     * @private
     */
    AsyncQueue.prototype._processNext = function () {
        if (this._pending.length === 0) {
            return;
        }
        
        var job = this._pending.shift(),
            fn = job.fn,
            deferred = job.deferred;

        this._current = fn()
            .fail(function (err) {
                this.emit("error", err);
            }.bind(this))
            .finally(function () {
                deferred.resolve();
                this._current = null;

                if (!this._isPaused) {
                    this._processNext();
                }
            }.bind(this))
            .done();
    };

    /**
     * Pause the queue, returning a promise that resolves when the queue has
     * quiesced. If there is no currently executing job, the promise is returned
     * as resolved. Otherwise, it resolves when the currently executing job is
     * complete.
     * 
     * @return {Promise}
     */
    AsyncQueue.prototype.pause = function () {
        this._isPaused = true;

        if (this._current) {
            return this._current;
        } else {
            return new Q();
        }
    };

    /**
     * Unpause the queue, continuing to process the existing jobs.
     */
    AsyncQueue.prototype.unpause = function () {
        this._isPaused = false;

        if (!this._current) {
            this._processNext();
        }
    };

    module.exports = AsyncQueue;
}());
