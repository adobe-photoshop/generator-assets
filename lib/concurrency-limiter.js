/*
 * Copyright (c) 2015 Adobe Systems Incorporated. All rights reserved.
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

    var os = require("os"),
        Q = require("q");

    var ConcurrencyLimiter = function (maxJobs) {
        this._maxJobs = maxJobs || os.cpus().length;
        this._jobs = [];
        this._numRunningJobs = 0;
    };

    ConcurrencyLimiter.prototype.enqueue = function (promiseFactory) {
        var deferred = Q.defer();

        this._jobs.push({
            deferred: deferred,
            promiseFactory: promiseFactory
        });
        this._runNextJob();

        return deferred.promise;
    };

    ConcurrencyLimiter.prototype._runNextJob = function () {
        // Do nothing if there's no more queued jobs or if we're running at max concurrency.
        if (this._jobs.length <= 0 || this._numRunningJobs >= this._maxJobs) {
            return;
        }

        // Dequeue the job and run it.
        var job = this._jobs.shift();
        var promise = job.promiseFactory();
        this._numRunningJobs++;

        promise
            .finally(function () {
                this._numRunningJobs--;

                // Resolve or reject the job's deferred.
                var status = promise.inspect();
                if (status.state === "fulfilled") {
                    job.deferred.resolve(status.value);
                } else {
                    job.deferred.reject(status.reason);
                }

                this._runNextJob();
            }.bind(this));

        this._runNextJob();
    };

    module.exports = ConcurrencyLimiter;
}());
