/*jslint indent: 2, maxlen: 80, nomen: true */
/*global define, jIO, jio_tests, test, ok, sinon, QUnit */

/*
For running in an XWiki instance:
Paste into page, eg: http://127.0.0.1/bin/view/Main/Test
Navigate to page plus path to test:
http://127.0.0.1/bin/view/Main/Test/path/to/tests/on/filesystem/tests.html

{{groovy}}
import java.io.File;
import java.io.FileInputStream;
import org.apache.commons.io.IOUtils;
def path = request.getRequestURI().replace(doc.getURL(), "");
def f = new File(path);
if (f.exists()) {
  if (path.endsWith(".css")) { response.setContentType("text/css"); }
  if (path.endsWith(".js")) { response.setContentType("text/javascript"); }
  def fis = new FileInputStream(f);
  def ros = response.getOutputStream();
  try {
    IOUtils.copy(fis, ros);
    ros.close();
    xcontext.setFinished(true);
  } finally { fis.close(); }
}
{{/groovy}}
*/

// define([module_name], [dependencies], module);
(function (dependencies, module) {
  "use strict";
  if (typeof define === 'function' && define.amd) {
    return define(dependencies, module);
  }
  module(jIO);
}(['jio', 'xwikistorage'], function (jIO) {
  "use strict";

  // This test will only be run if we are inside of a live XWiki instance.
  if (!window.location.href.match(/xwiki\/bin\/view/)) {
    return;
  }

  function nThen(next) {
    var funcs = [], calls = 0, waitFor, ret;
    waitFor = function(func) {
      calls++;
      return function() {
        if (func) {
          func.apply(null, arguments);
        }
        calls = (calls || 1) - 1;
        while (!calls && funcs.length) {
          funcs.shift()(waitFor);
        }
      };
    };
    next(waitFor);
    ret = {
      nThen: function(next) {
        funcs.push(next);
        return ret;
      },
      orTimeout: function(func, milliseconds) {
        var cto, timeout;
        timeout = setTimeout(function () {
          while (funcs.shift() !== cto) ;
          func(waitFor);
          calls = (calls || 1) - 1;
          while (!calls && funcs.length) { funcs.shift()(waitFor); }
        }, milliseconds);
        funcs.push(cto = function () { clearTimeout(timeout); });
        return ret;
      }
    };
    return ret;
  }

  module('XWikiStorage Live');


  test("Get Put Document", function () {

    var jio = jIO.newJio({type: 'xwiki', useBlobs:true});
    QUnit.stop();
    jio.start();

    nThen(function(waitFor) {

      // Remove the document if it exists.
      jio.remove({"_id": "one.json"}, waitFor());

    }).nThen(function(waitFor) {

      // post a new document
      var arg = {"_id": "one.json", "title": "hello"};
      jio.post(arg, waitFor(function (err, ret) {
        ok(!err && ret);
        ok(ret.id === "one.json");
        ok(ret.ok === true);
      }));

    }).nThen(function(waitFor) {

      jio.get("one.json", waitFor(function(err, ret) {
        ok(!err && ret);
        ok(ret._id === "one.json");
        ok(ret.title === "hello");
      }));

    }).nThen(function(waitFor) {

      // modify document
      var arg = {"_id": "one.json", "title": "hello modified"};
      jio.put(arg, waitFor(function (err, ret) {
        ok(!err && ret);
        QUnit.deepEqual({"id": "one.json", "ok": true}, ret);
      }));

    }).nThen(function(waitFor) {

      jio.get("one.json", waitFor(function(err, ret) {
        ok(!err && ret);
        ok(ret.title === "hello modified");
      }));

    }).nThen(function(waitFor) {

      // remove Document
      jio.remove("one.json", waitFor(function (err, ret) {
        ok(!err && ret);
        QUnit.deepEqual({"id": "one.json", "ok": true}, ret);
      }));

    }).nThen(function(waitFor) {

      console.log("success");

    }).orTimeout(function() {

      //console.log("failed");
      ok(0);

    }, 15000).nThen(function() {

      console.log("complete");
      jio.stop();
      QUnit.start();

    });
  });


  test("Attachments", function () {

    var jio = jIO.newJio({type: 'xwiki', useBlobs:true});
    QUnit.stop();
    jio.start();

    nThen(function(waitFor) {

      // post a new document
      jio.post({"_id": "attachment.test"}, waitFor());

    }).nThen(function(waitFor) {

      // add attachment
      jio.putAttachment({
        "_id": "attachment.test",
        "_attachment": "att.txt",
        "_mimetype": "text/plain",
        "_data": "there2"
      }, waitFor(function (err, ret) {
        ok(!err && ret);
        ok(ret.id === "attachment.test/att.txt");
        ok(ret.ok === true);
      }));

    }).nThen(function(waitFor) {

      // get Attachment
      var arg = {"_id":"attachment.test", "_attachment":"att.txt"};
      jio.getAttachment(arg, waitFor(function(err, ret) {
        ok(!err && ret);
        var fr = new FileReader();
        fr.onload = waitFor(function(dat) {
          ok(dat.target.result == "there2");
        });
        fr.readAsText(ret);
      }));

    }).nThen(function(waitFor) {

      // remove Attachment
      var arg = {"_id":"attachment.test","_attachment":"att.txt"};
      jio.removeAttachment(arg, waitFor(function (err, ret) {
        ok(!err && ret);
        QUnit.deepEqual({"id": "attachment.test/att.txt", "ok": true}, ret);
      }));

    }).nThen(function(waitFor) {

      // remove Document
      jio.remove("attachment.test", waitFor());

    }).nThen(function(waitFor) {

      console.log("success");

    }).orTimeout(function() {

      //console.log("failed");
      ok(0);

    }, 15000).nThen(function() {

      console.log("complete");
      jio.stop();
      QUnit.start();

    });

  });


  test("XWiki Search", function () {

    var jio = jIO.newJio({type: 'xwiki', useBlobs:true});
    QUnit.stop();
    jio.start();

    nThen(function(waitFor) {

      // post a new document
      var d = {"_id": "search.test", "title":"hello", "content":"hello world"};
      jio.post(d, waitFor());

      d = {"_id": "search.test2", "title":"hi", "content":"hello jio"};
      jio.post(d, waitFor());

    }).nThen(function(waitFor) {

      // test allDocs
      var q = '(space: "Main" AND name: "search.test")';
      jio.allDocs({query: q}, waitFor(function (err, ret) {
        ok(!err && ret, "test allDocs");
        ok(ret.total_rows === 1, "1 row total");
        ok(ret.rows[0].title === 'hello', "title is hello");
        ok(!('content' in ret.rows[0]), 'content is undefined');
      }));

      // test allDocs with include_docs enabled
      var q = '(space: "Main" AND name: "search.test")';
      jio.allDocs({query: q, include_docs:true}, waitFor(function (err, ret) {
        ok(!err && ret, "test allDocs with include_docs enabled");
        ok(ret.total_rows === 1, "1 row");
        ok(ret.rows[0].title === 'hello', "title");
        ok(ret.rows[0].content === 'hello world', "content");
      }));

      // wildcard character
      jio.allDocs({
        query: '(space: "Main" AND name: "search.tes*")',
        wildcard_character: '*',
        sort_on: [['name','ascending']]
      }, waitFor(function (err, ret) {
        ok(!err && ret, "wildcard character");
        ok(ret.total_rows === 2, "2 rows");
        ok(ret.rows[0].title === 'hello', "row1 title == hello");
        ok(ret.rows[1].title === 'hi', "row2 title == hi");
      }));

      // default wildcard character and alternate sorting
      jio.allDocs({
        query: '(space: "Main" AND name: "search.tes%")',
        sort_on: [['name','decending']]
      }, waitFor(function (err, ret) {
        ok(!err && ret, "default wildcard character and alternate sorting");
        ok(ret.total_rows === 2, "2 rows");
        ok(ret.rows[0].title === 'hello', "row2 title is hello");
        ok(ret.rows[1].title === 'hi', "row1 title is hi");
      }));

      // limit 1
      jio.allDocs({
        query: '(space: "Main" AND name: "search.tes%")',
        limit: [0, 1]
      }, waitFor(function (err, ret) {
        ok(!err && ret, "limit 1");
        ok(ret.total_rows === 1, "1 row");
        ok(ret.rows[0].title === 'hello', "title is hello");
      }));

      // skip 1
      jio.allDocs({
        query: '(space: "Main" AND name: "search.tes%")',
        limit: [1, 1]
      }, waitFor(function (err, ret) {
        ok(!err && ret, "skip 1");
        ok(ret.total_rows === 1, "1 row");
        ok(ret.rows[0].title === 'hi', "title is hi");
      }));

    }).nThen(function(waitFor) {

      jio.remove({"_id": "search.test"}, waitFor());
      jio.remove({"_id": "search.test2"}, waitFor());

    }).nThen(function(waitFor) {

      console.log("success");

    }).orTimeout(function() {

      //console.log("failed");
      ok(0);

    }, 15000).nThen(function() {

      console.log("complete");
      jio.stop();
      QUnit.start();

    });
  });

}));
