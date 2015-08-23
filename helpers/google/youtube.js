"use strict";

var YouTube = require('youtube-node'),
    youTube = new YouTube(),
    _ = require('underscore'),
    prefix = 'https://youtu.be/';

var EMPTY_RESULTS_MESSAGE = 'No results for: “$1”';

youTube.setKey(process.env.YOUTUBE_TOKEN || "paste_your_token_here");
youTube.addParam('type', 'video');

var youTubeService = {
    /**
     * Searches youtube for videos
     * picks one of 10 results
     * @param {String} query
     * @returns {Promise}
     */
    search: function (query) {
        var promise = new Promise(function (resolve, reject) {
            youTube.search(query, 10, function (error, result) {
                if (error) {
                    reject(error);
                } else {
                    var items = result.items,
                        responseItem = _.sample(items);
                    if(_.isEmpty(items)) {
                        resolve(EMPTY_RESULTS_MESSAGE.replace('$1', query));
                        return;
                    }
                    resolve(prefix + responseItem.id.videoId);
                }
            });
        });
        return promise;
    }
};

module.exports = youTubeService;