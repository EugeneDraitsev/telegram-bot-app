'use strict';

var _ = require('underscore');

var magic8ball = {
    prediction: prediction
    //for more api//
};

function prediction () {
    return cases(_.random(0, 18));
}

function cases(num) {
    switch (num) {
        case 0: return 'Бесспорно';
        case 1: return 'Предрешено';
        case 2: return 'Никаких сомнений';
        case 3: return 'Определённо да';
        case 4: return 'Можешь быть уверен в этом';
        case 5: return 'Мне кажется — «да»';
        case 6: return 'Вероятнее всего';
        case 7: return 'Хорошие перспективы';
        case 8: return 'Знаки говорят — «да»';
        case 9: return 'Пока не ясно, попробуй снова';
        case 10: return 'Спроси позже';
        case 11: return 'Лучше не рассказывать';
        case 12: return 'Сейчас нельзя предсказать';
        case 13: return 'Сконцентрируйся и спроси опять';
        case 14: return 'Даже не думай';
        case 15: return 'Мой ответ — «нет»';
        case 16: return 'По моим данным — «нет»';
        case 17: return 'Перспективы не очень хорошие';
        case 18: return 'Весьма сомнительно';
        default: return 'alah babah'
    }
}

module.exports = magic8ball;