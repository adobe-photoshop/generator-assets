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

    var main = require("../main");
    main._setConfig({
        "svg-enabled": true,
        "webp-enabled": true
    });

    var analyzeComponent = main._analyzeComponent;

    exports.testOnlyCheckPresentValues = function (test) {
        test.functionReportsErrors(test, analyzeComponent, [{}], []);

        test.done();
    };

    exports.testScalingChecks = function (test) {
        // Correct values
        test.functionReportsErrors(test, analyzeComponent,
            [{ scale: 0.5 }], []);
        test.functionReportsErrors(test, analyzeComponent,
            [{ width: 300, height: 200, widthUnit: "px", heightUnit: "in" }], []);

        // Incorrect values
        test.functionReportsErrors(test, analyzeComponent,
            [{ scale:  0 }], ["Cannot scale an image to 0%"]);
        
        test.functionReportsErrors(test, analyzeComponent,
            [{ width:  0 }], ["Cannot set an image width to 0"]);
        test.functionReportsErrors(test, analyzeComponent,
            [{ height: 0 }], ["Cannot set an image height to 0"]);
        
        test.functionReportsErrors(test, analyzeComponent,
            [{ widthUnit: "foo" }], ["Unsupported image width unit \"foo\""]);
        test.functionReportsErrors(test, analyzeComponent,
            [{ heightUnit: "bar" }], ["Unsupported image height unit \"bar\""]);

        test.done();
    };

    exports.testFileExtensionChecks = function (test) {
        // Correct values
        test.functionReportsErrors(test, analyzeComponent,
            [{ extension: "jpg" }], []);
        
        // Incorrect values: No message should be sent, but an error reported nonetheless
        test.functionReportsErrors(test, analyzeComponent,
            [{ extension: "foo" }], [undefined]);

        test.done();
    };

    exports.testQualityChecks = function (test) {
        // Correct values
        test.functionReportsErrors(test, analyzeComponent,
            [{ extension: "jpg", quality: "5" }], []);
        test.functionReportsErrors(test, analyzeComponent,
            [{ extension: "jpg", quality: "50%" }], []);
        
        test.functionReportsErrors(test, analyzeComponent,
            [{ extension: "webp", quality: "5" }], []);
        test.functionReportsErrors(test, analyzeComponent,
            [{ extension: "webp", quality: "50%" }], []);
        
        test.functionReportsErrors(test, analyzeComponent,
            [{ extension: "png", quality: "32" }], []);
        
        // Incorrect values
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "jpg", quality: "0" }],
            ["Quality must be between 1 and 10 (is \"0\")"]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "jpg", quality: "11" }],
            ["Quality must be between 1 and 10 (is \"11\")"]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "jpg", quality: "0%" }],
            ["Quality must be between 1% and 100% (is \"0%\")"]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "jpg", quality: "101%" }],
            ["Quality must be between 1% and 100% (is \"101%\")"]);
        
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "webp", quality: "0" }],
            ["Quality must be between 1 and 10 (is \"0\")"]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "webp", quality: "11" }],
            ["Quality must be between 1 and 10 (is \"11\")"]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "webp", quality: "0%" }],
            ["Quality must be between 1% and 100% (is \"0%\")"]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "webp", quality: "101%" }],
            ["Quality must be between 1% and 100% (is \"101%\")"]);

        test.functionReportsErrors(test, analyzeComponent, [{ extension: "png", quality: "13" }],
            ["PNG quality must be 8, 24 or 32 (is \"13\")"]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "png", quality: "13%" }],
            ["PNG quality must be 8, 24 or 32 (is \"13%\")"]);

        test.functionReportsErrors(test, analyzeComponent, [{ extension: "gif", quality: "23" }],
            ["There should not be a quality setting for files with the extension \"gif\""]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "gif", quality: "23%" }],
            ["There should not be a quality setting for files with the extension \"gif\""]);

        test.functionReportsErrors(test, analyzeComponent, [{ extension: "gif", quality: "23" }],
            ["There should not be a quality setting for files with the extension \"gif\""]);
        test.functionReportsErrors(test, analyzeComponent, [{ extension: "gif", quality: "23%" }],
            ["There should not be a quality setting for files with the extension \"gif\""]);

        test.done();
    };

    exports.testFileNames = function (test) {
        // Only test here if file name checking is done at all.
        // Detailed testing of file name checking is done in test-valid-file-name.js
        test.functionReportsErrors(test, analyzeComponent, [{ file: "foo.jpg" }],
            []);
        test.functionReportsErrors(test, analyzeComponent, [{ file: "fo:o.jpg" }],
            ["File name contains invalid character \":\""]);

        test.done();
    };

}());
