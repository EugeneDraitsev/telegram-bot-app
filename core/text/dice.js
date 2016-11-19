/**
 * Created by bdsm on 18.11.16.
 */
'use strict';


var dice = {
    trowDice: function (number) {
        var diceString = "";
        if ((!isNaN(+number)) && (+number)) {
            if (number > 100) {
                diceString = "```  ___\n/     \\\n| " + diceNumberLen(getRandomDice(100)) + " |\n\\     /\n  ¯¯¯```";
            }
            else {
                diceString = "```  ___\n/     \\\n| " + diceNumberLen(getRandomDice(number)) + " |\n\\     /\n  ¯¯¯```";
            }
        }
        else {
            diceString = "```  ___\n/     \\\n| " + diceNumberLen(getRandomDice(6)) + " |\n\\     /\n  ¯¯¯```";
        }
        return diceString;
    }
};

function getRandomDice(max) {
    return Math.floor(Math.random() * max) + 1;
}

function diceNumberLen(number) {
    var numberString = String(number);
    while (numberString.length < 3) {

        numberString = "0" + numberString;
    }
    return numberString;
}


module.exports = dice;



