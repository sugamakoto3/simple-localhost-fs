'use strict'

const path = require("path");
const parseUrl = require('parseurl');
const fs = require('fs');

const express = require("express");
const bodyParser = require("body-parser");
const serveStatic = require("serve-static");
const etag = require("etag");
const typeis = require('type-is');


//---- Express app routing

const app = module.exports = express();
const root = ".";
const rootPath = path.normalize(path.resolve(root) + path.sep);
const fallthrough = false;

// override POST -> PUT,DELETE
app.use(formMethodOverride("_method"));
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));
// parse */json
app.use(bodyParser.json({ extended: true }));

// GETのクエリ文字列にeditorが含まれているとき、エディタを送る。
app.get("/*", function(req, res, next) {
    if(!req.query.editor) return next();
    res.sendFile("editor.html", {root: "."});
});

// GETのクエリ文字列にformが含まれているとき、フォームを送る。
app.get("/*", function(req, res, next) {
    if(!req.query.form) return next();
    res.sendFile("form.html", {root: "."});
});

// GET, HEAD
app.use("/", serveStatic(".", {index: false}));

// PUT
app.put("/*", function(req, res, next) {
    // Content-Type: application/x-www-form-urlencoded or */json
    if(!typeis(req, ["*/x-www-form-urlencoded", "json"])) {
        return next();
    }
    if(typeof req.body["newText"] !== "string") {   //FIXME not string は起こらない
        res.statusCode = 400;
        res.send("TypeError: qs[newText] must be of type string");
        return;
    }
    const pathname = decodeURIComponent(parseUrl(req).pathname);
    const filename = path.normalize(path.join(rootPath, pathname));
    const etagCode = req.header("If-Match");
    const text = req.body["newText"];
    // write file
    const statusCode = writeFile(filename, etagCode, text);
    res.statusCode = statusCode;
    res.end();
});

// DELETE
app.delete("/*", function(req, res, next){
    const pathname = decodeURIComponent(parseUrl(req).pathname);
    const filename = path.normalize(path.join(rootPath, pathname));
    const etagCode = req.header("If-Match");
    // delete file
    const statusCode = deleteFile(filename, etagCode);
    res.statusCode = statusCode;
    res.end();
});


//---- file function

function writeFile(filename, etagCode, text) {
    if(!fs.existsSync(filename)) {
        const dirname = path.dirname(filename);
        if(!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
        fs.writeFileSync(filename, text);
        return 201; // Created
    }
    const stat = fs.statSync(filename);
    if(!stat.isFile()) {
        return 409; // Conflict
    }
    try {
        fs.accessSync(filename, fs.constants.W_OK);
    } catch (error) {
        return 403; // Forbidden
    }
    if(etagCode && etagCode !== etag(stat)) {
        return 412; // Precondition Failed
    }
    fs.writeFileSync(filename, text);
    return 204; // No Content
}

function deleteFile(filename, etagCode) {
    if(!fs.existsSync(filename)) {
        return 404; // Not Found
    }
    const stat = fs.statSync(filename);
    if(!stat.isFile()) {
        return 409; // Conflict
    }
    try {
        fs.accessSync(filename, fs.constants.W_OK);
    } catch (error) {
        return 403; // Forbidden
    }
    if(etagCode && etagCode !== etag(stat)) {
        return 412; // Precondition Failed
    }
    fs.unlinkSync(filename);
    return 204; // No Content
}


//---- util

/**
 * フォームから送られてくるHTTPメソッドを他のメソッドに書き換えるミドルウェアを返す。
 * Content-Typeが application/x-www-form-urlencoded
 * @param {string} getter 書き換え先のメソッドが書いてあるキー。
 * @param {array} options.methods 書き換え元のメソッド。
 */
function formMethodOverride(getter, options={ methods:["POST"] }) {
    const methodOverride = require("method-override");
    const router = express();
    router.use(bodyParser.urlencoded({ extended: true }));
    router.use(methodOverride(function (req, res) {
        if (req.body && typeof req.body === 'object' && getter in req.body) {
            var method = req.body._method
            delete req.body._method
            return method
        }
    }, options));
    return router;
}


//---- run

if (!module.parent) {
    const serveIndex = require("serve-index");
    app.use("/", serveIndex(".", {icons: true, view: "details"}));
    app.listen(3000, "localhost", () => console.log("Express started on port 3000"));
}
