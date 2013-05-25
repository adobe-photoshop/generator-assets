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
    
    var resolve = require("path").resolve,
        chmod = require("fs").chmodSync;
    
    grunt.initConfig({
        "pkg" : grunt.file.readJSON("package.json"),
        "platform" : process.platform === "darwin" ? "mac" : "win",
        "directories" : {
            "downloads" : "downloads/",
            "bin" : "bin/"
        },

        "jshint" : {
            "options" : {
                "jshintrc"   : ".jshintrc"
            },
            "all" : [
                "*.js",
                "package.json",
                ".jshintrc",
                "lib/**/*.js",
                "lib/jsx/**/*.jsx",
            ]
        },
        
        "clean" : {
            "download" : ["<%= directories.downloads %>"],
            "bin" : ["<%= directories.bin %>"]
        },
        
        "imagemagick": {
            "version" : "6.8.4-8",
            "platform-urls" : {
                "mac" : "https://s3-us-west-1.amazonaws.com/adobe-generator/" +
                    "ImageMagick-<%= imagemagick.version %>-x64-apple-portable.tar.gz",
                "win" : "https://s3-us-west-1.amazonaws.com/adobe-generator/" +
                    "ImageMagick-<%= imagemagick.version %>-Q16-x86-windows.zip"
            },
            "url" : "<%= grunt.config('imagemagick.platform-urls.' + grunt.config('platform')) %>",
            "archiveFilename" :
                "<%= grunt.config('imagemagick.url').substr(grunt.config('imagemagick.url').lastIndexOf('/') + 1) %>",
            "archivePath" : "<%= directories.downloads %><%= imagemagick.archiveFilename %>",
            "extractedDirectory" : "ImageMagick-<%= imagemagick.version %>/",
            "platform-executables" : {
                "mac" : ["convert"],
                "win" : ["convert.exe"]
            },
            "platform-executables-dir" : {
                "mac" : "<%= directories.downloads %><%= imagemagick.extractedDirectory %>utilities/",
                "win" : "<%= directories.downloads %><%= imagemagick.extractedDirectory %>"
            }
        },
        "curl-dir": {
            "imagemagick" : {
                "src" : "<%= imagemagick.url %>",
                "dest" : "<%= directories.downloads %>"
            }
        },
        
        "shell": {
            "untarImagemagick" : {
                "command": "tar -xvzf <%= imagemagick.archiveFilename %>",
                "options": {
                    "stdout": true,
                    "stderr": true,
                    "failOnError": true,
                    "execOptions": {
                        "cwd": "<%= directories.downloads %>"
                    }
                }
            }
        }
        
        
    });

    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-shell");
    grunt.loadNpmTasks("grunt-curl");

    grunt.registerTask("default", ["jshint", "build"]);
        
    grunt.registerTask("build", "Top-level configure and build", function () {
        var platform = grunt.config("platform"),
            binDir = grunt.config("directories.bin"),
            executables = grunt.config("imagemagick.platform-executables")[platform];
        
        grunt.file.mkdir(binDir);
        
        var setupImagemagick = false;
        executables.forEach(function (e) {
            setupImagemagick = setupImagemagick || !grunt.file.exists(binDir, e);
        });
        
        if (setupImagemagick) {
            grunt.task.run("setup-imagemagick");
        } else {
            grunt.log.writeln("Imagemagick already set up");
        }
        
    });

    
    /* ImageMagick download tasks */
    
    grunt.registerTask("setup-imagemagick", ["download-imagemagick", "extract-imagemagick", "copy-imagemagick"]);
        
    grunt.registerTask("download-imagemagick", "Download ImageMagick", function () {
        if (!grunt.file.exists(grunt.config("imagemagick.archivePath"))) {
            grunt.log.writeln("Downloading ImageMagick");
            grunt.task.run("curl-dir:imagemagick");
        } else {
            grunt.log.writeln("ImageMagick already downloaded");
        }
    });
                       
    grunt.registerTask("extract-imagemagick", "Extract ImageMagick", function () {
        if (!grunt.file.exists(grunt.config("directories.downloads"), grunt.config("imagemagick.extractedDirectory"))) {
            if (/\.tar\.gz$/.test(grunt.config("imagemagick.archiveFilename"))) {
                grunt.task.run("shell:untarImagemagick");
            } else if (/\.zip$/.test(grunt.config("imagemagick.archiveFilename"))) {
                grunt.fail.warn("Extracting ZIPs not yet implemented");
            } else {
                grunt.fail.warn("No rule for extracting archive file");
            }
        } else {
            grunt.log.writeln("ImageMagick already extracted");
        }
    });
        
    grunt.registerTask("copy-imagemagick", "Copy ImageMagick executables to bin", function () {
        var platform = grunt.config("platform"),
            binDir = grunt.config("directories.bin"),
            executables = grunt.config("imagemagick.platform-executables")[platform],
            executablesDir = grunt.config("imagemagick.platform-executables-dir")[platform];
        
        executables.forEach(function (e) {
            grunt.file.copy(
                resolve(executablesDir, e),
                resolve(binDir, e)
            );
            if (platform === "mac") {
                chmod(resolve(binDir, e), "755");
            }
        });
    });

};
