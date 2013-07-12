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

    var main = require("../main.js");

    exports.testExtensions = function (test) {
        var spec = {
            // No extension specified
            "Layer 1":                    [{ name: "Layer 1" }],

            // Capital letters in the extension
            "Foo.JpG":                    [{ name: "Foo.JpG",      file: "Foo.JpG",  extension: "jpg" }],
            "Foo.JpEg":                   [{ name: "Foo.JpEg",     file: "Foo.JpEg", extension: "jpeg" }],
            "Foo.PnG":                    [{ name: "Foo.PnG",      file: "Foo.PnG",  extension: "png" }],
        };
        test.expect(Object.keys(spec).length);
        Object.keys(spec).forEach(function (layerName) {
            var actual   = JSON.stringify(main.parseLayerName(layerName)),
                expected = JSON.stringify(spec[layerName]);
            
            test.equal(actual, expected, "Extension parsing");
        });
        test.done();
    };

    exports.testJPGQuality = function (test) {
        var spec = {
            // Good examples for JPGs with a quality parameter
            "foo.jpg-1":          [{ name: "foo.jpg-1",    file: "foo.jpg",  extension: "jpg", quality: "1" }],
            "foo.jpg4":           [{ name: "foo.jpg4",     file: "foo.jpg",  extension: "jpg", quality: "4" }],
            "foo.jpg-10":         [{ name: "foo.jpg-10",   file: "foo.jpg",  extension: "jpg", quality: "10" }],
            "foo.jpg-1%":         [{ name: "foo.jpg-1%",   file: "foo.jpg",  extension: "jpg", quality: "1%" }],
            "foo.jpg42%":         [{ name: "foo.jpg42%",   file: "foo.jpg",  extension: "jpg", quality: "42%" }],
            "foo.jpg-100%":       [{ name: "foo.jpg-100%", file: "foo.jpg",  extension: "jpg", quality: "100%" }],
            
            // Bad examples for JPGs with a quality parameter
            "foo.jpg-0":          [{ name: "foo.jpg-0",    file: "foo.jpg",  extension: "jpg", quality: "0" }],
            "foo.jpg-11":         [{ name: "foo.jpg-11",   file: "foo.jpg",  extension: "jpg", quality: "11" }],
            "foo.jpg-0%":         [{ name: "foo.jpg-0%",   file: "foo.jpg",  extension: "jpg", quality: "0%" }],
            "foo.jpg-101%":       [{ name: "foo.jpg-101%", file: "foo.jpg",  extension: "jpg", quality: "101%" }],
        };
        test.expect(Object.keys(spec).length);
        Object.keys(spec).forEach(function (layerName) {
            var actual   = JSON.stringify(main.parseLayerName(layerName)),
                expected = JSON.stringify(spec[layerName]);
            
            test.equal(actual, expected, "JPG quality parsing");
        });
        test.done();
    };

    exports.testPNGQuality = function (test) {
        var spec = {
            // Good examples for PNGs with a quality parameter
            "foo.png-8":                  [{ name: "foo.png-8",    file: "foo.png",  extension: "png", quality: "8" }],
            "foo.png24":                  [{ name: "foo.png24",    file: "foo.png",  extension: "png", quality: "24" }],
            "foo.png-32":                 [{ name: "foo.png-32",   file: "foo.png",  extension: "png", quality: "32" }],

            // Bad example for a PNG with a quality parameter
            "foo.png-42":                 [{ name: "foo.png-42",   file: "foo.png",  extension: "png", quality: "42" }],
        };
        test.expect(Object.keys(spec).length);
        Object.keys(spec).forEach(function (layerName) {
            var actual   = JSON.stringify(main.parseLayerName(layerName)),
                expected = JSON.stringify(spec[layerName]);
            
            test.equal(actual, expected, "PNG quality parsing");
        });
        test.done();
    };

    exports.testRelativeScaling = function (test) {
        var spec = {
            // Good examples for a scale factor
            "1% foo.png":                 [{ name: "1% foo.png",   file: "foo.png",  extension: "png", scale: 0.01 }],
            "42% foo.png":                [{ name: "42% foo.png",  file: "foo.png",  extension: "png", scale: 0.42 }],
            "100% foo.png":               [{ name: "100% foo.png", file: "foo.png",  extension: "png", scale: 1.00 }],
            "142% foo.png":               [{ name: "142% foo.png", file: "foo.png",  extension: "png", scale: 1.42 }],
            
            // Bad examples for a scale factor
            "0% foo.png":                 [{ name: "0% foo.png",   file: "foo.png",  extension: "png", scale: 0}],
            "05% foo.png":                [{ name: "05% foo.png",  file: "foo.png",  extension: "png", scale: 0.05}],
            "1%foo.png":                  [{ name: "1%foo.png",    file: "foo.png",  extension: "png", scale: 0.01 }],
        };
        test.expect(Object.keys(spec).length);
        Object.keys(spec).forEach(function (layerName) {
            var actual   = JSON.stringify(main.parseLayerName(layerName)),
                expected = JSON.stringify(spec[layerName]);
            
            test.equal(actual, expected, "Relative scaling parsing");
        });
        test.done();
    };

    exports.testAbsoluteScaling = function (test) {
        var spec = {
            // Good examples of absolute scaling
            "100x80 foo.png":
                [{ name: "100x80 foo.png", file: "foo.png", extension: "png",
                        width: 100, widthUnits: "px", height: 80, heightUnits: "px"}],
            // spaces between lengths
            "80 x 100 foo.png":
                [{ name: "80 x 100 foo.png", file: "foo.png", extension: "png",
                        width: 80, widthUnits: "px", height: 100, heightUnits: "px"}],
            // mix of units and no units
            "4in x100  foo.png":
                [{ name: "4in x100  foo.png", file: "foo.png", extension: "png",
                        width: 4, widthUnits: "in", height: 100, heightUnits: "px"}],
            // mix of units
            "90mm x120cm foo.png":
                [{ name: "90mm x120cm foo.png", file: "foo.png", extension: "png",
                        width: 90, widthUnits: "mm", height: 120, heightUnits: "cm"}],
            // wild card
            "100x? foo.png":
                [{ name: "100x? foo.png", file: "foo.png", extension: "png", width: 100, widthUnits: "px"}],
            // wild card mixed with units
            "?x60in foo.png":
                [{ name: "?x60in foo.png", file: "foo.png", extension: "png", height: 60, heightUnits: "in"}],

            // Bad examples of absolute scaling
            // no space before file name
            "100x100foo.png":
                [{ name: "100x100foo.png", file: "100x100foo.png", extension: "png"}],
            // mix of scaling
            "80x100 60% foo.png":
                [{ name: "80x100 60% foo.png", file: "60% foo.png", extension: "png",
                        width: 80, widthUnits: "px", height: 100, heightUnits: "px"}],
            // mix of scaling with relative first
            "50% 80x100 foo.png":
                [{ name: "50% 80x100 foo.png", file: "80x100 foo.png", extension: "png", scale: 0.50 }],
            // multiple units
            "20in cm x50cm foo.png":
                [{ name: "20in cm x50cm foo.png", file: "20in cm x50cm foo.png", extension: "png"}],
            // invalid unit, will not fail, but analyze will throw errors
            "30nm x20 nano.png":
                [{ name: "30nm x20 nano.png", file: "nano.png", extension: "png",
                        width: 30, widthUnits: "nm", height: 20, heightUnits: "px"}],
                
        };
        test.expect(Object.keys(spec).length);
        Object.keys(spec).forEach(function (layerName) {
            var actual   = JSON.stringify(main.parseLayerName(layerName)),
                expected = JSON.stringify(spec[layerName]);
            
            test.equal(actual, expected, "Absolute scaling parsing");
        });
        test.done();
    };

    exports.testLayerGroups = function (test) {
        var layer1PNG = { name: "Layer 1.png", file: "Layer 1.png", extension: "png" };
        var layer2JPG = { name: "Layer 2.jpg", file: "Layer 2.jpg", extension: "jpg" };

        var spec = {
            // Space in file name
            "Layer 1.png":                [layer1PNG],
            
            // Comma as separator
            "Layer 1.png,Layer 2.jpg":    [layer1PNG, layer2JPG],
            "Layer 1.png,   Layer 2.jpg": [layer1PNG, layer2JPG],
            
            // Plus as separator
            "Layer 1.png+Layer 2.jpg":    [layer1PNG, layer2JPG],
            "Layer 1.png  + Layer 2.jpg": [layer1PNG, layer2JPG],
        };
        test.expect(Object.keys(spec).length);
        Object.keys(spec).forEach(function (layerName) {
            var actual   = JSON.stringify(main.parseLayerName(layerName)),
                expected = JSON.stringify(spec[layerName]);
            
            test.equal(actual, expected, "Layer grouping");
        });
        test.done();
    };

    exports.testUltimate = function (test) {
        var spec = {
            // Putting it all together
            "100% Delicious, 42%Layer 1.png24  + 100x100 Layer.jpg-90% , 250% Foo Bar Baz.gif": [
                { name: "100% Delicious" },
                { name: "42%Layer 1.png24", file: "Layer 1.png", extension: "png", quality: "24", scale: 0.42 },
                { name: "100x100 Layer.jpg-90%", file: "Layer.jpg", extension: "jpg", quality: "90%",
                        width: 100, widthUnits: "px", height: 100, heightUnits: "px" },
                { name: "250% Foo Bar Baz.gif", file: "Foo Bar Baz.gif", extension: "gif", scale: 2.5 },
            ],
        };
        test.expect(Object.keys(spec).length);
        Object.keys(spec).forEach(function (layerName) {
            var actual   = JSON.stringify(main.parseLayerName(layerName)),
                expected = JSON.stringify(spec[layerName]);
            
            test.equal(actual, expected, "Mixed testing");
        });
        test.done();
    };

 
}());
