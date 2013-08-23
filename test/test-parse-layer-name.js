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

    require("./assertions");
    
    var main = require("../main.js");

    exports.testExtensions = function (test) {
        var spec = {
            // No extension specified
            "Layer 1":                    [{ name: "Layer 1" }],

            // Capital letters in the extension
            "Foo.JpG":                    [{ name: "Foo.JpG",      file: "Foo.JpG",  extension: "jpg" }],
            "Foo.JpEg":                   [{ name: "Foo.JpEg",     file: "Foo.JpEg", extension: "jpeg" }],
            "Foo.PnG":                    [{ name: "Foo.PnG",      file: "Foo.PnG",  extension: "png" }],
            "Foo.WeBp":                   [{ name: "Foo.WeBp",     file: "Foo.WeBp", extension: "webp" }],
        };

        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
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
        
        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
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
        
        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
        test.done();
    };

    exports.testWEBPQuality = function (test) {
        var spec = {
            // Good examples for WEBPs with a quality parameter
            "foo.webp-1":          [{ name: "foo.webp-1",    file: "foo.webp",  extension: "webp", quality: "1" }],
            "foo.webp4":           [{ name: "foo.webp4",     file: "foo.webp",  extension: "webp", quality: "4" }],
            "foo.webp-10":         [{ name: "foo.webp-10",   file: "foo.webp",  extension: "webp", quality: "10" }],
            "foo.webp-1%":         [{ name: "foo.webp-1%",   file: "foo.webp",  extension: "webp", quality: "1%" }],
            "foo.webp42%":         [{ name: "foo.webp42%",   file: "foo.webp",  extension: "webp", quality: "42%" }],
            "foo.webp-100%":       [{ name: "foo.webp-100%", file: "foo.webp",  extension: "webp", quality: "100%" }],
            
            // Bad examples for WEBPs with a quality parameter
            "foo.webp-0":          [{ name: "foo.webp-0",    file: "foo.webp",  extension: "webp", quality: "0" }],
            "foo.webp-11":         [{ name: "foo.webp-11",   file: "foo.webp",  extension: "webp", quality: "11" }],
            "foo.webp-0%":         [{ name: "foo.webp-0%",   file: "foo.webp",  extension: "webp", quality: "0%" }],
            "foo.webp-101%":       [{ name: "foo.webp-101%", file: "foo.webp",  extension: "webp", quality: "101%" }],
        };
        
        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
        test.done();
    };

    exports.testRelativeScaling = function (test) {
        var spec = {
            // Good examples for a scale factor
            "1% foo.png":                 [{ name: "1% foo.png",   file: "foo.png",  extension: "png", scale: 0.01 }],
            "42% foo.png":                [{ name: "42% foo.png",  file: "foo.png",  extension: "png", scale: 0.42 }],
            "100% foo.png":               [{ name: "100% foo.png", file: "foo.png",  extension: "png", scale: 1.00 }],
            "142% foo.png":               [{ name: "142% foo.png", file: "foo.png",  extension: "png", scale: 1.42 }],
            "05% foo.png":                [{ name: "05% foo.png",  file: "foo.png",  extension: "png", scale: 0.05}],
            "1%foo.png":                  [{ name: "1%foo.png",    file: "foo.png",  extension: "png", scale: 0.01 }],
            // Parses correctly, but analyze will throw error (0% scaling not allowed)
            "0% foo.png":                 [{ name: "0% foo.png",   file: "foo.png",  extension: "png", scale: 0}],
        };
        
        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
        test.done();
    };

    exports.testAbsoluteScaling = function (test) {
        var spec = {
            // Good examples of absolute scaling
            "100x80 foo.png":
                [{ name: "100x80 foo.png", file: "foo.png", extension: "png",
                        width: 100, height: 80 }],
            // spaces between lengths
            "80 x 100px foo.png":
                [{ name: "80 x 100px foo.png", file: "foo.png", extension: "png",
                        width: 80, height: 100, heightUnit: "px" }],
            // mix of units and no units
            "4in x100  foo.png":
                [{ name: "4in x100  foo.png", file: "foo.png", extension: "png",
                        width: 4, widthUnit: "in", height: 100 }],
            // mix of units
            "90mm x120cm foo.png":
                [{ name: "90mm x120cm foo.png", file: "foo.png", extension: "png",
                        width: 90, widthUnit: "mm", height: 120, heightUnit: "cm"}],
            // wild card
            "100x? foo.png":
                [{ name: "100x? foo.png", file: "foo.png", extension: "png", width: 100 }],
            // wild card mixed with units
            "?x60in foo.png":
                [{ name: "?x60in foo.png", file: "foo.png", extension: "png", height: 60, heightUnit: "in"}],
            // fractional sizes
            "5.5in x 6.3cm foo.png":
                [{ name: "5.5in x 6.3cm foo.png", file: "foo.png", extension: "png",
                        width: 5.5, widthUnit: "in", height: 6.3, heightUnit: "cm"}],
            "5.0cm x .3mm foo.png":
                [{ name: "5.0cm x .3mm foo.png", file: "foo.png", extension: "png",
                        width: 5, widthUnit: "cm", height: 0.3, heightUnit: "mm"}],
            // fractional pixels are (currently) okay, too - the other units require rounding support anyway
            "5.5 x 6.3px foo.png":
                [{ name: "5.5 x 6.3px foo.png", file: "foo.png", extension: "png",
                        width: 5.5, height: 6.3, heightUnit: "px"}],

            // Bad examples of absolute scaling
            // no space before file name
            "100x100foo.png":
                [{ name: "100x100foo.png", file: "100x100foo.png", extension: "png"}],
            // mix of scaling
            "80x100 60% foo.png":
                [{ name: "80x100 60% foo.png", file: "60% foo.png", extension: "png",
                        width: 80, height: 100 }],
            // mix of scaling with relative first
            "50% 80x100 foo.png":
                [{ name: "50% 80x100 foo.png", file: "80x100 foo.png", extension: "png", scale: 0.50 }],
            // multiple units
            "20in cm x50cm foo.png":
                [{ name: "20in cm x50cm foo.png", file: "20in cm x50cm foo.png", extension: "png"}],
            // invalid unit, will not fail, but analyze will throw errors
            "30nm x20 nano.png":
                [{ name: "30nm x20 nano.png", file: "nano.png", extension: "png",
                        width: 30, widthUnit: "nm", height: 20 }],
            // Multiple decimal points
            "3.4.5in x 6.7in foo.png":
                [{ name: "3.4.5in x 6.7in foo.png", file: "3.4.5in x 6.7in foo.png", extension: "png" }],

            // Multiple decimal points in second size
            "3.4in x 5.6.7in foo.png":
                [{ name: "3.4in x 5.6.7in foo.png", file: "3.4in x 5.6.7in foo.png", extension: "png" }],

            // Comma used as place value separator
            "3,4in x 5,6in foo.png":
                [{ name: "3" },
                 { name: "4in x 5"},
                 { name: "6in foo.png", file: "6in foo.png", extension: "png" }]
        };

        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
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
        
        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
        test.done();
    };

    exports.testWhitespace = function (test) {
        var spec = {
            "  foo.jpg   ,    bar     ": [
                { name: "foo.jpg", file: "foo.jpg", extension: "jpg" },
                { name: "bar" }
            ],
        };
        
        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
        test.done();
    };

    // "معايير"

    exports.testRTL = function (test) {
        var spec = {
            "معايير.jpg": [
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" }
            ],
            "foo.jpg,معايير.jpg": [
                { name: "foo.jpg", file: "foo.jpg", extension: "jpg" },
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" }
            ],
            "foo.jpg+معايير.jpg": [
                { name: "foo.jpg", file: "foo.jpg", extension: "jpg" },
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" }
            ],
            "foo.jpg معايير.png": [
                { name: "foo.jpg معايير.png", file: "foo.jpg معايير.png", extension: "png" }
            ],
            "foo.jpg, معايير.jpg": [
                { name: "foo.jpg", file: "foo.jpg", extension: "jpg" },
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" }
            ],
            "foo.jpg+ معايير.jpg": [
                { name: "foo.jpg", file: "foo.jpg", extension: "jpg" },
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" }
            ],
            "foo.jpg ,معايير.jpg": [
                { name: "foo.jpg", file: "foo.jpg", extension: "jpg" },
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" }
            ],
            "foo.jpg +معايير.jpg": [
                { name: "foo.jpg", file: "foo.jpg", extension: "jpg" },
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" }
            ],
            "معايير.jpg,bar.jpg": [
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" },
                { name: "bar.jpg", file: "bar.jpg", extension: "jpg" }
            ],
            "معايير.jpg+bar.jpg": [
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" },
                { name: "bar.jpg", file: "bar.jpg", extension: "jpg" }
            ],
            "معايير.jpg bar.png": [
                { name: "معايير.jpg bar.png", file: "معايير.jpg bar.png", extension: "png" }
            ],
            "معايير.jpg, bar.jpg": [
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" },
                { name: "bar.jpg", file: "bar.jpg", extension: "jpg" }
            ],
            "معايير.jpg+ bar.jpg": [
                { name: "معايير.jpg", file: "معايير.jpg", extension: "jpg" },
                { name: "bar.jpg", file: "bar.jpg", extension: "jpg" }
            ]

        };
        
        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
        test.done();
    };

    exports.testUltimate = function (test) {
        var spec = {
            // Putting it all together
            "100% Delicious, 42%Layer 1.png24  + 100x100 Layer.jpg-90% , 250% Foo Bar Baz.gif": [
                { name: "100% Delicious" },
                { name: "42%Layer 1.png24", file: "Layer 1.png", extension: "png", quality: "24", scale: 0.42 },
                { name: "100x100 Layer.jpg-90%", file: "Layer.jpg", extension: "jpg", quality: "90%",
                        width: 100, height: 100 },
                { name: "250% Foo Bar Baz.gif", file: "Foo Bar Baz.gif", extension: "gif", scale: 2.5 },
            ],
        };
        
        test.expect(Object.keys(spec).length + 1);
        test.callsMatchSpecification(test, main._parseLayerName, spec);
        test.done();
    };
}());
