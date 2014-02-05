start
	= speclist

speclist
	= first:spec "+" rest:speclist {
		rest.unshift(first); 
		return rest; 
	}
	/ first:spec "," rest:speclist {
		rest.unshift(first);
		return rest;
	}
	/ only:spec { return [only]; }

spec
	= _ size:(scale?) _ filepart:filename _ { // disallow duplicate scales
		var result = {
			file: filepart.filename,
			extension: filepart.extension,
		}

		if (filepart.quality) {
			result.quality = filepart.quality;
		}

		if (size) {
			if (size.scale !== null) {
				result.scale = size.scale;
			}

			if (size.width) {
				result.width = size.width;
			}

			if (size.widthUnit) {
				result.widthUnit = size.widthUnit;
			}

			if (size.height) {
				result.height = size.height;
			}

			if (size.heightUnit) {
				result.heightUnit = size.heightUnit;
			}
		}
		
		return result;
	}
	/ _ layername:rchars _ {
		return {
			name: layername.trim()
		};
	}

filename
	= nameparts:(rcharsthendot+) extpart:fileext {
		var filename = String.prototype.concat.apply("", nameparts) + extpart.extension;

		return {
			filename: filename.trim(),
			extension: extpart.extension.toLowerCase(),
			quality: extpart.quality
		};
	} 

fileext
	= extension:[a-zA-Z]+ "-"? quality:digit* pct:"%"? {
		var result = {
			extension: extension.join(""),
		};

		if (quality || pct) {
			result.quality = quality.join("") + (pct ? pct : "");
		}

		return result;
	}

scale
	= relscale
	/ abs:absscale " " { return abs; }

relscale
	= scale:percentage {
		return {
			scale: scale
		};
	}

absscale
	= width:absunit _ "x"i _ height:absunit {
		return {
			width: width.value,
			widthUnit: width.unit,
			height: height.value,
			heightUnit: height.unit
		};
	}

absunit
	= value:number unit:unit? {
		return {
			value: value,
			unit: unit
		};
	}
	/ "?" {
		return { };
	}

unit
	= chars:([a-z][a-z]) {
		return chars.join("");
	}

percentage
	= num:digit* "%" {
		return parseInt(num.join("")) / 100;
	}

// stolen from the JSON grammer spec

rcharsthendot
  = chars:rchars "." {
  	return chars.concat(".");
  }

rchars
  = chars:rchar+ { return chars.join(""); }

chars
  = chars:char+ { return chars.join(""); }

rchar
  = [^\.\+,"\\\0-\x1F\x7f]
  / '\\"'  { return '"';  }
  / "\\\\" { return "\\"; }
  / "\\/"  { return "/";  }
  / "\\b"  { return "\b"; }
  / "\\f"  { return "\f"; }
  / "\\n"  { return "\n"; }
  / "\\r"  { return "\r"; }
  / "\\t"  { return "\t"; }
  / "\\u" digits:$(hexDigit hexDigit hexDigit hexDigit) {
      return String.fromCharCode(parseInt(digits, 16));
    }

char
  // In the original JSON grammar: "any-Unicode-character-except-"-or-\-or-control-character"
  = [^"\\\0-\x1F\x7f]
  / '\\"'  { return '"';  }
  / "\\\\" { return "\\"; }
  / "\\/"  { return "/";  }
  / "\\b"  { return "\b"; }
  / "\\f"  { return "\f"; }
  / "\\n"  { return "\n"; }
  / "\\r"  { return "\r"; }
  / "\\t"  { return "\t"; }
  / "\\u" digits:$(hexDigit hexDigit hexDigit hexDigit) {
      return String.fromCharCode(parseInt(digits, 16));
    }

number "number"
  = parts:$(int frac)     { return parseFloat(parts); }
  / parts:$(int)          { return parseFloat(parts); }
  / parts:$(frac)         { return parseFloat(parts.slice(1)) / 10; }

posint
  = parts:$(digit19 digits) { return parseInt(parts); }
  / parts:$(digit)			{ return parseInt(parts); }

int
  = posint
  / "-" posint

frac
  = "." digits

digits
  = digit+


/*
 * The following rules are not present in the original JSON gramar, but they are
 * assumed to exist implicitly.
 *
 * FIXME: Define them according to ECMA-262, 5th ed.
 */

digit
  = [0-9]

digit19
  = [1-9]

hexDigit
  = [0-9a-fA-F]

/* ===== Whitespace ===== */

_ "whitespace"
  = whitespace*

// Whitespace is undefined in the original JSON grammar, so I assume a simple
// conventional definition consistent with ECMA-262, 5th ed.
whitespace
  = [ \t\n\r]