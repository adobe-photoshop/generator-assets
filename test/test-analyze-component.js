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

    var ParserManager = require("../lib/parsermanager");

    var _parserManager = new ParserManager({
        "svg-enabled": true,
        "webp-enabled": true
    });

    exports.testNormalization = function (test) {
        var component;

        // Extension normalization
        component = {
            extension: "jpeg"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.extension, "jpg", "Extension normalization");

        component = {
            extension: "JPG"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.extension, "jpg", "Extension normalization");

        component = {
            extension: "JpeG"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.extension, "jpg", "Extension normalization");

        component = {
            extension: "pNg"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.extension, "png", "Extension normalization");

        component = {
            extension: "gIF"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.extension, "gif", "Extension normalization");

        component = {
            extension: "Svg"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.extension, "svg", "Extension normalization");

        component = {
            extension: "webP"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.extension, "webp", "Extension normalization");

        // Quality normalization
        component = {
            extension: "jpg",
            quality: "100%"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.quality, 100, "Quality normalization");

        component = {
            extension: "jpg",
            quality: "3%"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.quality, 3, "Quality normalization");

        component = {
            extension: "jpg",
            quality: "3"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.quality, 30, "Quality normalization");

        component = {
            extension: "png",
            quality: "32"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.quality, 32, "Quality normalization");

        component = {
            extension: "png",
            quality: "24a"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.quality, 32, "Quality normalization");

        // Unit normalization
        component = {
            width: 1,
            widthUnit: "IN"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.widthUnit, "in", "Width unit normalization");

        component = {
            width: 1,
            widthUnit: "cM"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.widthUnit, "cm", "Width unit normalization");

        component = {
            width: 1,
            widthUnit: "Px"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.widthUnit, "px", "Width unit normalization");

        component = {
            width: 1,
            widthUnit: "mM"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.widthUnit, "mm", "Width unit normalization");

        component = {
            height: 1,
            heightUnit: "IN"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.heightUnit, "in", "Height unit normalization");

        component = {
            height: 1,
            heightUnit: "cM"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.heightUnit, "cm", "Height unit normalization");

        component = {
            height: 1,
            heightUnit: "Px"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.heightUnit, "px", "Height unit normalization");

        component = {
            height: 1,
            heightUnit: "mM"
        };
        _parserManager._normalizeComponent(component);
        test.equal(component.heightUnit, "mm", "Height unit normalization");

        test.done();
    };


    exports.testAnalysis = function (test) {
        function _equalSets(arr, set) {
            set = set || {};
            test.ok(arr.length === Object.keys(set).length, "Wrong number of errors: " + arr.length);

            arr.forEach(function (err) {
                test.ok(set.hasOwnProperty(err), "Spurious error: " + err);
            });
        }

        var component,
            errors;

        component = {
            name: "0% foo.png",
            file: "foo.png",
            extension: "png",
            scale: 0
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid scale: 0%": true });

        component = {
            name: "0% foo.png",
            file: "foo.png",
            extension: "png",
            scale: 50
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "0x1in foo.png",
            file: "foo.png",
            extension: "png",
            width: 0,
            height: 1,
            heightUnit: "in"
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid width: 0": true });

        component = {
            name: "1inx0 foo.png",
            file: "foo.png",
            extension: "png",
            width: 1,
            widthUnit: "in",
            height: 0
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid height: 0": true });

        component = {
            name: "1x1in foo.png",
            file: "foo.png",
            extension: "png",
            width: 1,
            height: 1,
            heightUnit: "in"
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "0x0 foo.png",
            file: "foo.png",
            extension: "png",
            width: 0,
            height: 0
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid width: 0": true, "Invalid height: 0": true });

        component = {
            name: "1aax2 foo.png",
            file: "foo.png",
            extension: "png",
            width: 1,
            widthUnit: "aa",
            height: 2
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid width unit: aa": true });

        component = {
            name: "2x1aa foo.png",
            file: "foo.png",
            extension: "png",
            width: 2,
            height: 1,
            heightUnit: "aa"
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid height unit: aa": true });

        component = {
            name: "1inx2 foo.png",
            file: "foo.png",
            extension: "png",
            width: 1,
            widthUnit: "in",
            height: 2
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "1cmx2 foo.png",
            file: "foo.png",
            extension: "png",
            width: 1,
            widthUnit: "cm",
            height: 2
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "1mmx2 foo.png",
            file: "foo.png",
            extension: "png",
            width: 1,
            widthUnit: "mm",
            height: 2
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "1pxx2 foo.png",
            file: "foo.png",
            extension: "png",
            width: 1,
            widthUnit: "px",
            height: 2
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.xyz",
            file: "foo.xyz",
            extension: "xyz"
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Unsupported extension: xyz": true });
        
        component = {
            name: "foo.gif",
            file: "foo.gif",
            extension: "gif"
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.jpeg",
            file: "foo.jpg",
            extension: "jpg"
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.SVG",
            file: "foo.svg",
            extension: "svg"
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.webp",
            file: "foo.webp",
            extension: "webp"
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.jpg0",
            file: "foo.jpg",
            extension: "jpg",
            quality: 0
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid quality: 0": true });

        component = {
            name: "foo.jpg11",
            file: "foo.jpg",
            extension: "jpg",
            quality: 110
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid quality: 110": true });

        component = {
            name: "foo.jpg10",
            file: "foo.jpg",
            extension: "jpg",
            quality: 100
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.webp0",
            file: "foo.webp",
            extension: "webp",
            quality: 0
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid quality: 0": true });

        component = {
            name: "foo.webp11",
            file: "foo.webp",
            extension: "webp",
            quality: 110
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid quality: 110": true });

        component = {
            name: "foo.webp10",
            file: "foo.webp",
            extension: "webp",
            quality: 100
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.png0",
            file: "foo.png",
            extension: "png",
            quality: 0
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid quality: 0": true });

        component = {
            name: "foo.png7",
            file: "foo.png",
            extension: "png",
            quality: 7
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid quality: 7": true });

        component = {
            name: "foo.png8",
            file: "foo.png",
            extension: "png",
            quality: 8
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.png24",
            file: "foo.png",
            extension: "png",
            quality: 24
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.png32",
            file: "foo.png",
            extension: "png",
            quality: 32
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors);

        component = {
            name: "foo.gif8",
            file: "foo.gif",
            extension: "gif",
            quality: 8
        };
        errors = _parserManager._analyzeComponent(component);
        _equalSets(errors, { "Invalid quality: 8": true });

        test.done();
    };

}());
