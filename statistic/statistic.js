/**
 * Created by dr on 09.08.2015.
 */
'use strict';



var statistic = {
    allTimeStats: function (container) {
        var text = 'Most popular words:\n',
            keys = Object.keys(container);

        keys.sort(compareCount);

        for (var i = 0; i < 10; i++) {
            text += keys[i] + ':' + container[keys[i]] + '\n'
        }

        function compareCount(a, b) {
            return container[b] - container[a];
        }
        return text;
    }
};

module.exports = statistic;