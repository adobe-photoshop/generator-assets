{
    /*
     * Merge a size object into a results object, taking care to only copy defined values.
     */
    function mergeSize(size, result) {
        if (size) {
            if (size.hasOwnProperty("scale")) {
                result.scale = size.scale;
            }

            if (size.hasOwnProperty("width")) {
                result.width = size.width;
            }

            if (size.hasOwnProperty("widthUnit")) {
                result.widthUnit = size.widthUnit;
            }

            if (size.hasOwnProperty("height")) {
                result.height = size.height;
            }

            if (size.hasOwnProperty("heightUnit")) {
                result.heightUnit = size.heightUnit;
            }
        }
    }
    
    /*
     * Merge a canvasRect object into a results object, taking care to only copy defined values.
     * Currently on width and height, as well as X & Y offset.
     */
    function mergeCanvasRect(rect, result) {
        if (rect) {
            if (rect.hasOwnProperty("width")) {
                result.canvasWidth = rect.width;
            }
            
            if (rect.hasOwnProperty("height")) {
                result.canvasHeight = rect.height;
            }

            if (rect.hasOwnProperty("x")) {
                result.canvasOffsetX = rect.x;
            }

            if (rect.hasOwnProperty("y")) {
                result.canvasOffsetY = rect.y;
            }
        }
    }
}

start "Either a default asset specification or a layer asset specification"
    = defaults
    / speclist

defaults "A document defaults specification"
    = "default" defaults:defaultspeclist {
        return defaults;
    }

defaultspeclist "List of default specification components"
    = first:defaultspec [+,] rest:defaultspeclist {
        rest.unshift(first);
        return rest;
    }
    / only:defaultspec {
        return [only];
    }

defaultspec "A single default specification component"
    = whitespace+ size:scale? _ canvasrect:compcanvasrect? _ folders:folder* suffix:goodcharsanddots? _ 
    & { return size || folders.length > 0 || (suffix && suffix.trim().length > 0)} { // require at least one spec
        var result = {
            "default": true,
            name: text().trim()
        };

        if (folders.length > 0) {
            result.folder = folders;
        }

        if (suffix) {
            suffix = suffix.trim();
            if (suffix.length > 0) {
                result.suffix = suffix;
            }            
        }

        mergeSize(size, result);
        mergeCanvasRect(canvasrect, result);

        return result;
    }

speclist "List of layer specifications"
    = first:spec [+,] rest:speclist {
        rest.unshift(first); 
        return rest; 
    }
    / only:spec {
        return [only];
    }

spec "Layer specification"
    = filespec
    / _ layername:chars _ { // Unparsed layer name part
        return {
            name: layername.trim()
        };
    }

folder "A single folder name that ends with a slash and does not begin with a dot"
    = chars:goodcharsanddots "/" 
    ! { return chars[0] == "."; } {
        return chars;
    }

filespec "A size-and-file specification"
    = _ size:scale? _ canvasrect:compcanvasrect? _ folders:folder* filepart:filename _ { // Parsed layer name part
        var result = {
            name: text().trim(),
            file: filepart.filename.replace(/[\\":*?<>!|]/g,'_'),
            extension: filepart.extension,
        }

        if (folders.length > 0) {
            result.folder = folders;
        }

        if (filepart.hasOwnProperty("quality")) {
            result.quality = filepart.quality;
        }

        mergeSize(size, result);
        mergeCanvasRect(canvasrect, result);
        
        return result;
    }


filename "Filename and quality suffix"
    = nameparts:goodcharsthendot+ suffix:fileext {
        var filename = String.prototype.concat.apply("", nameparts) + suffix.extension;
        if (filename.match(/^\s/)) {
            error("Filename begins with whitespace");
        }

        var result = {
                filename: filename.trim(),
                extension: suffix.extension.toLowerCase()
            };

        if (suffix.hasOwnProperty("quality")) {
            result.quality = suffix.quality;
        }

        return result;
    } 

fileext "File extension and quality suffix"
    = extension:[a-zA-Z]+ quality:quality? {
        var result = {
            extension: extension.join(""),
        };

        if (quality) {
            result.quality = quality;
        }

        return result;
    }

quality "Quality parameter that follows a file extension"
    = "-"? param:digits ext:([a-z] / "%")? {
        return param.join("") + (ext || "");
    }

scale "Relative or absolute scale"
    = relscale
    / abs:absscale " " {
        return abs;
    }

relscale "Relative scale, like 0.3"
    = scale:percent {
        return {
            scale: scale
        };
    }

absscale "Absolute scale, like 50x100cm"
    = width:abscomp _ "x"i _ height:abscomp {
        var result = {};

        if (width.hasOwnProperty("value")) {
            result.width = width.value;
        }

        if (width.hasOwnProperty("unit")) {
            result.widthUnit = width.unit;
        }

        if (height.hasOwnProperty("value")) {
            result.height = height.value;
        }

        if (height.hasOwnProperty("unit")) {
            result.heightUnit = height.unit;
        }

        return result;
    }

abscomp "Absolute scale component, like 100cm"
    = value:number unit:unit? {
        var result = {
            value: value,
        };

        if (unit) {
            result.unit = unit;
        }

        return result;
    }
    / "?" { // wildcard component
        return {
            // no unit
        };
    }

compcanvasrect "Component canvas rect, either long or short form without offsets, or long form with offsets"
    = longcanvasrect
    / longcanvasrectwithoffsets
    / shortcanvasrect

longcanvasrect "Long form component canvas size, like [32x64], offset support to get added later"
    = csize: "[" w:number "x" h:number "]" {
        return {width: w, height: h};
    }

longcanvasrectwithoffsets "Long form component canvas size, like [32x64+11-23], with offsets"
    = csize: "[" w:number "x" h:number xsign:[+-] x:number ysign:[+-] y:number "]" {
        return {width: w, height: h,
            x: xsign === "+" ? x : -1 * x,
            y: ysign === "+" ? y : -1 * y };
    }

shortcanvasrect "short form component canvas rect to just set a common width/height, like [32]"
    = csize: "[" val:number "]" {
        return {width: val, height: val};
    }

unit "Unit abbreviation"
    = first:[a-z]i second:[a-z]i {
        return first + second;
    }

percent "A percentage, like 30%"
    = num:number "%" {
        return num / 100;
    }

goodcharsanddots 
    = chars:goodcharanddot+ {
        return chars.join("")
    }

goodcharanddot "A good character or a dot"
    = goodchar
    / "."

goodcharsthendot "A sequence of characters that ends with a dot"
    = chars:goodchars "." {
        return chars.concat(".");
    }

chars "A sequence of characters, including dots"
    = chars:char+ {
        return chars.join("");
    }

goodchars "A sequence of characters, excluding dots"
    = chars:goodchar+ {
        return chars.join("");
    }

char "A character, including dots"
    = [^,+]

goodchar "A character, excluding dots and other weird things"
    = [^+,./\0-\x1F\x7f]

number "A nonnegative number, which may or may not have leading zeros"
    = parts:$(digits ("." digits)?) { return parseFloat(parts); } // e.g., 123 or 1.23
    / parts:$("." digits)           { return parseFloat("0" + parts); } // e.g., .123

digits
    = digit+

digit
    = [0-9]

_ "whitespace"
    = whitespace*

whitespace
    = [ \t\n\r]
