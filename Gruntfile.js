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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, node: true */

module.exports = function (grunt) {
    "use strict";
        
    grunt.initConfig({
        pkg : grunt.file.readJSON("package.json"),

        platform : process.platform === "darwin" ? "mac" : "win",

        jshint : {
            options : {
                jshintrc : ".jshintrc",
                reporterOutput: ""
            },
            js : [
                "*.js",
                "lib/**/*.js",
                "test/**/*.js",
                "!lib/parser.js"
            ],
            jsx : [
                "lib/**/*.jsx"
            ],
            json : [
                "package.json",
                ".jshintrc",
                ".jscsrc"
            ]
        },
        
        jscs: {
            js: "<%= jshint.js %>",
            jsx: [
                "<%= jshint.jsx %>"
            ],
            options: {
                config: ".jscsrc"
            }
        },
 
        nodeunit : {
            all : ["test/test-*.js"]
        },
       
        peg : {
            layernames : {
                src : "etc/layernames.pegjs",
                dest : "lib/parser.js",
                options : {
                    cache: true
                }
            }
        }

    });

    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-jscs");
    grunt.loadNpmTasks("grunt-contrib-nodeunit");
    grunt.loadNpmTasks("grunt-peg");

    grunt.registerTask("test", ["jshint", "jscs", "nodeunit"]);

    grunt.registerTask("build", ["peg"]);

    grunt.registerTask("default", ["test"]);

};
