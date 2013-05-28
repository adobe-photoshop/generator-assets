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

    var zlib = require("zlib"),
        crc32 = require("buffer-crc32");
     
    function setPixel1(read, png, pixels, pngIndex, bufferIndex) {
        var grey = read.call(pixels, bufferIndex);
        png[pngIndex]     = grey; // r
        png[pngIndex + 1] = grey; // g
        png[pngIndex + 2] = grey; // b
        png[pngIndex + 3] = 255;  // a
    }

    function setPixel3(read, png, pixels, pngIndex, bufferIndex) {
        png[pngIndex]     = read.call(pixels, bufferIndex + 2); // r
        png[pngIndex + 1] = read.call(pixels, bufferIndex + 1); // g
        png[pngIndex + 2] = read.call(pixels, bufferIndex);     // b
        png[pngIndex + 3] = 255;                                // a
    }

    function setPixel4(read, png, pixels, pngIndex, bufferIndex) {
        png[pngIndex]     = read.call(pixels, bufferIndex + 1); // r
        png[pngIndex + 1] = read.call(pixels, bufferIndex + 2); // g
        png[pngIndex + 2] = read.call(pixels, bufferIndex + 3); // b
        png[pngIndex + 3] = read.call(pixels, bufferIndex);     // a
    }

    function getReadFunction(bitsPerChannel) {
        if (8  === bitsPerChannel) {
            return Buffer.prototype.readUInt8;
        }
        if (16 === bitsPerChannel) {
            return Buffer.prototype.readUInt16BE;
        }
        if (32 === bitsPerChannel) {
            return Buffer.prototype.readUInt32BE;
        }
    }

    function getSetPixel(channelCount, read) {
        if (4 === channelCount) {
            return setPixel4.bind(null, read);
        }
        if (3 === channelCount) {
            return setPixel3.bind(null, read);
        }
        if (1 === channelCount) {
            return setPixel1.bind(null, read);
        }
    }

    /**
     * The IHDR chunk must appear FIRST. It contains:
     * Width:              4 bytes
     * Height:             4 bytes
     * Bit depth:          1 byte
     * Color type:         1 byte
     * Compression method: 1 byte
     * Filter method:      1 byte
     * Interlace method:   1 byte
     */

    function IHDR(w, h) {
        var buffer = new Buffer(13);
        buffer.writeUInt32BE(w, 0);
        buffer.writeUInt32BE(h, 4);
        buffer.writeUInt32BE(0x08060000, 8); // 32bit RGBA
        buffer.writeInt8(0, 12);
        return buffer;
    }

    function chunk(type, data) {
        var dataLength = data ? data.length : 0;
        var buffer = new Buffer(12 + dataLength);

        buffer.writeUInt32BE(dataLength, 0);        // length
        buffer.writeUInt32BE(type, 4);              // type
        if (data) {
            data.copy(buffer, 8);                   // data
        }

        // crc of type and data
        var crcData = buffer.slice(4, dataLength + 8);
        var crc = crc32.unsigned(crcData);

        buffer.writeUInt32BE(crc, dataLength + 8);  // crc32

        return buffer;
    }

    module.exports = function xpm2png(pixmap, cb) {
        var width = pixmap.width;
        var height = pixmap.height;
        var channelCount = pixmap.channelCount;
        // var rowBytes = pixmap.width * channelCount // Not used.
        // var colorMode = pixmap.colorMode //Not used.
        var bitsPerChannel = pixmap.bitsPerChannel;
        var pixels = pixmap.pixels;

        // get functions based on format
        var readChannel = getReadFunction(bitsPerChannel);
        var setPixel = getSetPixel(channelCount, readChannel);

        var bufferIndex = 0;
        var bufferLength = pixels.length;
        var pngIndex = 0;
        var row = width * 4;

        var IDAT = new Buffer(bufferLength + height);

        // parse pixmap
        while (bufferIndex < bufferLength) {
            // write the filter value (0) at the start of the row
            if (bufferIndex % row === 0) {
                IDAT[pngIndex ++] = 0; // no filter
            }

            setPixel(IDAT, pixels, pngIndex, bufferIndex);

            // increment indexes accordingly to the number of channels
            pngIndex += 4;
            bufferIndex += channelCount;
        }

        zlib.deflate(IDAT, function (err, IDATComp) {
            if (err) {
                throw err;
            }

            cb(Buffer.concat([
                new Buffer("89504e470D0A1A0A", "hex"),    // PNG signature
                chunk(0x49484452, IHDR(width, height)),   // Image header chunk
                chunk(0x49444154, IDATComp),              // Image data chunk
                chunk(0x49454E44, null)                   // End chunk
            ]));
        });
    };

}());