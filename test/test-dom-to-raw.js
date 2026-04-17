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

    var fs = require("fs"),
        Document = require("../lib/dom/document"),
        Raw = require("../lib/dom/raw");

    exports.testDOMSerialization = function (test) {
        var generator = null,
            config = null,
            logger = {
                warn: function () {}
            },
            rawDocinfo = JSON.parse(
                fs.readFileSync("./test/resources/all-layer-types-docinfo.json", "utf8")
            ),
            document = new Document(generator, config, logger, rawDocinfo),
            expectedToRawResult = JSON.parse(
                fs.readFileSync("./test/resources/all-layer-types-docinfo-from-dom.json", "utf8")
            ),
            actualToRawResult = document.toRaw();

        test.deepEqual(
            Raw.sortJSON(actualToRawResult),
            Raw.sortJSON(expectedToRawResult),
            "Expected toRaw result"
        );
        test.done();
    };

    exports.testFileChangeApplyChange = function (test) {
        var generator = null,
            config = null,
            logger = {
                warn: function () {},
                error: function () {}
            },
            rawDocinfo = JSON.parse(
                fs.readFileSync("./test/resources/all-layer-types-docinfo.json", "utf8")
            ),
            document = new Document(generator, config, logger, rawDocinfo),
            originalFile = document.file,
            changedFile = "/tmp/renamed.psd",
            fileChangeEvent;

        document.on("file", function (change) {
            fileChangeEvent = change;
        });

        var applied = document._applyChange({
            id: document.id,
            version: document.version,
            timeStamp: document.timeStamp + 1,
            count: document.count + 1,
            file: changedFile
        });

        test.strictEqual(applied, true, "Expected file change to apply successfully");
        test.strictEqual(document.file, changedFile, "Expected file to be updated");
        test.ok(fileChangeEvent, "Expected file change event to be emitted");
        test.strictEqual(fileChangeEvent.previous, originalFile, "Expected previous file in change event");
        test.done();
    };

}());
