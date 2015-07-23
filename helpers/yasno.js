'use strict';

var yasno = {
    yasnyfy: function (text) {
        if (text.length === 0) {
            return text;
        }
        else {
            var year = new Date().getYear() + 1900;
            var yasnenko = "\n>Ясно";
            text = ("\n>" + year +"\n>" + text +yasnenko);
            return text;
        }

    }
};
module.exports = yasno;
