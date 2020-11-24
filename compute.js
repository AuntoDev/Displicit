var tf = require("@tensorflow/tfjs-node");
var nsfw = require("nsfwjs");
var axios = require("axios");
var os = require("os");
tf.enableProdMode();

process.on('message', async msg => {
    var res = await run(msg.url);

    process.send(res);
    process.exit();
});

async function run(url){
    var res = await axios.get(url, {
        responseType: "arraybuffer"
    })
    .catch(async(err) => {
        process.send({ err: true });
        process.exit();
    });

    if(!res || !res.data){
        process.send({ err: true });
        process.exit();
    }

    tf.engine().startScope();

    var model = await nsfw.load("file://model/", { size: 299 });
    var img = await tf.node.decodeImage(res.data, 3);
    var classes = await model.classify(img);
    
    img.dispose();
    
    var reviewed = {
        sexy: {},
        porn: {},
        hentai: {},
        err: false
    };
    
    classes.forEach(async(c) => {
        if(c.className == "Sexy") reviewed.sexy = { name: "explicit", pr: c.probability };
        if(c.className == "Porn") reviewed.porn = { name: "pornography", pr: c.probability };
        if(c.className == "Hentai") reviewed.hentai = { name: "hentai", pr: c.probability };
    });
    
    tf.dispose(model);
    tf.dispose(classes);
    tf.disposeVariables();
    tf.engine().endScope();

    return reviewed;
}