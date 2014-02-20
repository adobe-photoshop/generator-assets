start
    = speclist

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
        return chars
    }

filespec 
    = _ size:scale? _ folders:folder* filepart:filename _ { // Parsed layer name part
        var result = {
            name: text().trim(),
            file: filepart.filename,
            extension: filepart.extension,
        }

        if (folders.length > 0) {
            result.folder = folders.join("/");
        }

        if (filepart.hasOwnProperty("quality")) {
            result.quality = filepart.quality;
        }

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
        
        return result;
    }


filename "Filename and quality suffix"
    = nameparts:goodcharsthendot+ suffix:fileext {
        var filename = String.prototype.concat.apply("", nameparts) + suffix.extension,
            result = {
                filename: filename.trim(),
                extension: suffix.extension.toLowerCase()
            };

        if (suffix.hasOwnProperty("quality")) {
            result.quality = suffix.quality;
        }

        return result;
    } 

fileext "File extension and quality suffix"
    = extension:[a-zA-Z]+ "-"? quality:digit* pct:"%"? {
        var result = {
            extension: extension.join(""),
        };

        if (quality.length > 0 || pct) {
            result.quality = quality.join("") + (pct ? pct : "");
        }

        return result;
    }

scale "Relative or absolute scale"
    = relscale
    / abs:absscale " " {
        return abs;
    }

relscale
    = scale:percent {
        return {
            scale: scale
        };
    }

absscale "Absolute scale"
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

abscomp "Absolute scale component"
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

unit "Unit abbreviation"
    = first:[a-z]i second:[a-z]i {
        return first + second;
    }

percent
    = num:digit* "%" {
        return parseInt(num.join("")) / 100;
    }

goodcharsanddots 
    = chars:goodcharanddot+ {
        return chars.join("")
    }

goodcharanddot
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
    = [^+,."/*<>?!:|\\\0-\x1F\x7f]

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
