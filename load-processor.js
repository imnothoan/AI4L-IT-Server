// Load test processor - custom functions for Artillery
module.exports = {
    setRandomAnswer,
    logThetaProgression
};

function setRandomAnswer(context, events, done) {
    // Generate random answer (0-3)
    context.vars.randomAnswer = Math.floor(Math.random() * 4);
    return done();
}

function logThetaProgression(requestParams, response, context, ee, next) {
    if (response.body && response.body.data) {
        const { currentTheta, standardError, questionsAnswered } = response.body.data;

        if (currentTheta !== undefined) {
            console.log(`[CAT Progress] θ=${currentTheta.toFixed(3)}, SE=${standardError?.toFixed(3)}, Q=${questionsAnswered}`);
        }
    }

    return next();
}
