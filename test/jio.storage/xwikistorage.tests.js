/*jslint indent: 2, maxlen: 80, nomen: true */
/*global define, jIO, jio_tests, test, ok, sinon, QUnit */

// define([module_name], [dependencies], module);
(function (dependencies, module) {
  "use strict";
  if (typeof define === 'function' && define.amd) {
    return define(dependencies, module);
  }
  module(jIO, jio_tests);
}(['jio', 'jio_tests', 'xwikistorage'], function (jIO, util) {
  "use strict";

  function generateTools() {
    var o = {
      clock: sinon.useFakeTimers(),
      spy: util.ospy,
      tick: util.otick
    };
    function addFakeServerResponse(type, method, path, status, response) {
      o.server.respondWith(method, new RegExp(path), [
        status,
        {"Content-Type": 'application/xml'},
        response
      ]);
    }
    o.addFakeServerResponse = addFakeServerResponse;
    return o;
  }

  module('XWikiStorage');

  function setUp(that, liveTest) {
    var o = generateTools(that);
    o.server = sinon.fakeServer.create();
    o.jio = jIO.newJio({type: 'xwiki', formTokenPath: 'form_token'});
    o.addFakeServerResponse("xwiki", "GET", "form_token", 200,
                            '<meta name="form_token" content="OMGHAX"/>');
    o._addFakeServerResponse = o.addFakeServerResponse;
    o.expectedRequests = [];
    o.addFakeServerResponse = function (a, b, c, d, e) {
      o._addFakeServerResponse(a, b, c, d, e);
      o.expectedRequests.push([b, c]);
    };
    o.assertReqs = function (count, message) {
      var i, j, req, expected, ex;
      o.requests = (o.requests || 0) + count;
      ok(o.server.requests.length === o.requests,
         message + "[expected [" + count + "] got [" +
         (o.server.requests.length - (o.requests - count)) + "]]");
      for (i = 1; i <= count; i += 1) {
        req = o.server.requests[o.server.requests.length - i];
        if (!req) {
          break;
        }
        for (j = o.expectedRequests.length - 1; j >= 0; j -= 1) {
          expected = o.expectedRequests[j];
          if (req.method === expected[0] &&
              req.url.indexOf(expected[1]) !== -1) {
            o.expectedRequests.splice(j, 1);
          }
        }
      }
      ex = o.expectedRequests.pop();
      if (ex) {
        ok(0, "expected [" +  ex[0] + "] request for [" + ex[1] + "]");
      }
    };
    return o;
  }

  test("Post", function () {

    var o = setUp(this);

    // post without id
    o.spy(o, "status", 405, "Post without id");
    o.jio.post({}, o.f);
    o.clock.tick(5000);
    ok(o.f.called, "spy called");
    o.assertReqs(0, "no id -> no request");

    // post non empty document
    o.addFakeServerResponse("xwiki", "POST", "myFile", 201, "HTML RESPONSE");
    o.spy(o, "value", {"id": "myFile", "ok": true},
          "Create = POST non empty document");
    o.jio.post({"_id": "myFile", "title": "hello there"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(
      3,
      "put -> 1 request to get csrf token, 1 to get doc and 1 to post data"
    );

    // post but document already exists (post = error!, put = ok)
    o.answer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<page xmlns="http://www.xwiki.org"><title>hello there</title></page>';
    o.addFakeServerResponse("xwiki", "GET", "myFile2", 200, o.answer);
    o.spy(o, "status", 409, "Post but document already exists");
    o.jio.post({"_id": "myFile2", "title": "hello again"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(1, "post w/ existing doc -> 1 request to get doc then fail");

    util.closeAndcleanUpJio(o.jio);
  });

  test("Put", function () {

    var o = setUp(this);

    // put without id => id required
    o.spy(o, "status", 20, "Put without id");
    o.jio.put({}, o.f);
    o.clock.tick(5000);
    ok(o.f.called, "spy called");
    o.assertReqs(0, "put w/o id -> 0 requests");

    // put non empty document
    o.addFakeServerResponse("xwiki", "POST", "put1", 201, "HTML RESPONSE");
    o.spy(o, "value", {"ok": true, "id": "put1"},
          "Create = PUT non empty document");
    o.jio.put({"_id": "put1", "title": "myPut1"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(
      3,
      "put normal doc -> 1 req to get doc, 1 for csrf token, 1 to post"
    );

    // put but document already exists = update
    o.answer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<page xmlns="http://www.xwiki.org"><title>mtPut1</title></page>';
    o.addFakeServerResponse("xwiki", "GET", "put2", 200, o.answer);
    o.addFakeServerResponse("xwiki", "POST", "put2", 201, "HTML RESPONSE");
    o.spy(o, "value", {"ok": true, "id": "put2"}, "Updated the document");
    o.jio.put({"_id": "put2", "title": "myPut2abcdedg"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(
      3,
      "put update doc -> 1 req to get doc, 1 for csrf token, 1 to post"
    );

    util.closeAndcleanUpJio(o.jio);
  });

  test("PutAttachment", function () {

    var o = setUp(this);

    // putAttachment without doc id => id required
    o.spy(o, "status", 20, "PutAttachment without doc id");
    o.jio.putAttachment({}, o.f);
    o.clock.tick(5000);
    ok(o.f.called, "spy called");
    o.assertReqs(0, "put attach w/o doc id -> 0 requests");

    // putAttachment without attachment id => attachment id required
    o.spy(o, "status", 22, "PutAttachment without attachment id");
    o.jio.putAttachment({"_id": "putattmt1"}, o.f);
    o.clock.tick(5000);
    ok(o.f.called, "spy called");
    o.assertReqs(0, "put attach w/o attach id -> 0 requests");

    // putAttachment without underlying document => not found
    o.addFakeServerResponse("xwiki", "GET", "putattmtx", 404, "HTML RESPONSE");
    o.spy(o, "status", 404, "PutAttachment without document");
    o.jio.putAttachment({"_id": "putattmtx", "_attachment": "putattmt2"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(1, "put attach w/o existing document -> 1 request to get doc");

    // putAttachment with document without data
    o.answer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<page xmlns="http://www.xwiki.org"><title>myPutAttm</title></page>';
    o.addFakeServerResponse("xwiki", "GET", "putattmt1", 200, o.answer);
    o.addFakeServerResponse(
      "xwiki",
      "POST",
      "upload/Main/putattmt1",
      302,
      "HTML RESPONSE"
    );
    o.spy(o, "value", {"ok": true, "id": "putattmt1/putattmt2"},
          "PutAttachment with document, without data");
    o.jio.putAttachment({"_id": "putattmt1", "_attachment": "putattmt2"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(3, "put attach -> 1 request to get document, 1 to put " +
                 "attach, 1 to get csrf token");

    util.closeAndcleanUpJio(o.jio);
  });

  test("Get", function () {

    var o = setUp(this);

    // get inexistent document
    o.spy(o, "status", 404, "Get non existing document");
    o.jio.get("get1", o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(1, "try to get nonexistent doc -> 1 request");

    // get inexistent attachment
    o.spy(o, "status", 404, "Get non existing attachment");
    o.jio.get("get1/get2", o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(1, "try to get nonexistent attach -> 1 request");

    // get document
    o.answer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<page xmlns="http://www.xwiki.org"><title>some title</title></page>';
    o.addFakeServerResponse("xwiki", "GET", "get3", 200, o.answer);
    o.spy(o, "value", {"_id": "get3", "title": "some title"}, "Get document");
    o.jio.get("get3", o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(1, "get document -> 1 request");

    // get inexistent attachment (document exists)
    o.spy(o, "status", 404, "Get non existing attachment (doc exists)");
    o.addFakeServerResponse("xwiki", "GET", "get4/getx", 404, "HTTP RESPONSE");
    o.jio.get({"_id": "get4", "_attachment": "getx"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(1, "get nonexistant attachment -> 1 request");

    // get attachment
    o.answer = "My Attachment Content";
    o.addFakeServerResponse("xwiki", "GET", "get5/get5", 200, o.answer);
    o.spy(o, "value", o.answer, "Get attachment");
    o.jio.get({"_id": "get5", "_attachment": "get5"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(1, "get attachment -> 1 request");

    util.closeAndcleanUpJio(o.jio);
  });

  test("Remove", function () {

    var o = setUp(this);

    // remove inexistent document
    o.addFakeServerResponse("xwiki", "POST", "remove1", 404, "HTML RESPONSE");
    o.spy(o, "status", 404, "Remove non existening document");
    o.jio.remove({"_id": "remove1"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(
      2,
      "remove nonexistent doc -> 1 request for csrf and 1 for doc"
    );

    // remove inexistent document/attachment
    o.addFakeServerResponse("xwiki", "POST", "remove1/remove2", 404, "HTML" +
                            "RESPONSE");
    o.spy(o, "status", 404, "Remove inexistent document/attachment");
    o.jio.removeAttachment({"_id": "remove1", "_attachment": "remove2"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(
      2,
      "remove nonexistant attach -> 1 request for csrf and 1 for doc"
    );

    // remove document
    //o.answer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    //    '<page xmlns="http://www.xwiki.org"><title>some doc</title></page>';
    //o.addFakeServerResponse("xwiki", "GET", "remove3", 200, o.answer);
    o.addFakeServerResponse("xwiki", "POST", "bin/delete/Main/remove3",
                            200, "HTML RESPONSE");
    o.spy(o, "value", {"ok": true, "id": "remove3"}, "Remove document");
    o.jio.remove({"_id": "remove3"}, o.f);
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(
      2,
      "remove document -> 1 request for csrf and 1 for deleting doc"
    );

    o.answer = JSON.stringify({
      "_id": "remove4",
      "title": "some doc",
      "_attachments": {
        "remove5": {
          "length": 4,
          "digest": "md5-d41d8cd98f00b204e9800998ecf8427e"
        }
      }
    });
    // remove attachment
    o.addFakeServerResponse(
      "xwiki",
      "POST",
      "delattachment/Main/remove4/remove5",
      200,
      "HTML RESPONSE"
    );
    o.jio.removeAttachment({"_id": "remove4", "_attachment": "remove5"},
      (o.f = sinon.spy(function (err, ret) {
        ok(!err);
        QUnit.deepEqual(ret, {"ok": true, "id": "remove4/remove5"},
          "Remove attachment");
      })));
    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(2, "remove attach -> 1 request for csrf and 1 for deletion");

    util.closeAndcleanUpJio(o.jio);
  });



  test("AllDocs", function () {

    var o = setUp(this);

    o.addFakeServerResponse("xwiki", "GET", "rest/wikis/xwiki/query", 200, [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><searchResults x',
      'mlns="http://www.xwiki.org" template="http://ubnta8:8080/xwiki/rest/wi',
      'kis/xwiki/query?q={query}(&amp;type={xwql,hql,lucene})(&amp;number={nu',
      'mber})(&amp;start={start})(&amp;orderField={fieldname}(&amp;order={asc',
      '|desc}))(&amp;distinct=1)(&amp;prettyNames={false|true})(&amp;wikis={w',
      'ikis})(&amp;className={classname})"><searchResult><link rel="http://ww',
      'w.xwiki.org/rel/page" href="http://ubnta8:8080/xwiki/rest/wikis/xwiki/',
      'spaces/Stats/pages/WebHome"/><type>page</type><id>xwiki:Stats.WebHome<',
      '/id><pageFullName>Stats.WebHome</pageFullName><title>Statistics</title',
      '><wiki>xwiki</wiki><space>Stats</space><pageName>WebHome</pageName><mo',
      'dified>2013-02-28T09:51:12-05:00</modified><author>XWiki.Admin</author',
      '><version>1.1</version></searchResult><searchResult><link rel="http://',
      'www.xwiki.org/rel/page" href="http://ubnta8:8080/xwiki/rest/wikis/xwik',
      'i/spaces/Scheduler/pages/WebHome"/><type>page</type><id>xwiki:Schedule',
      'r.WebHome</id><pageFullName>Scheduler.WebHome</pageFullName><title>Job',
      ' Scheduler</title><wiki>xwiki</wiki><space>Scheduler</space><pageName>',
      'WebHome</pageName><modified>2010-10-27T22:57:27-04:00</modified><autho',
      'r>XWiki.Admin</author><version>1.1</version></searchResult><searchResu',
      'lt><link rel="http://www.xwiki.org/rel/page" href="http://ubnta8:8080/',
      'xwiki/rest/wikis/xwiki/spaces/Sandbox/pages/WebHome"/><type>page</type',
      '><id>xwiki:Sandbox.WebHome</id><pageFullName>Sandbox.WebHome</pageFull',
      'Name><title>Sandbox</title><wiki>xwiki</wiki><space>Sandbox</space><pa',
      'geName>WebHome</pageName><modified>2009-09-09T02:00:00-04:00</modified',
      '><author>XWiki.Admin</author><version>1.1</version></searchResult></se',
      'archResults>'].join(''));

    o.spy(o, "value", {
      ok: true,
      total_rows: 3,
      rows: [
        {
          _id: 'Stats/WebHome',
          title: 'Statistics',
          _last_modified: Date.parse('2013-02-28T09:51:12-05:00'),
          author: 'XWiki.Admin',
          version: '1.1'
        },
        {
          _id: 'Scheduler/WebHome',
          title: 'Job Scheduler',
          _last_modified: Date.parse('2010-10-27T22:57:27-04:00'),
          author: 'XWiki.Admin',
          version: '1.1'
        },
        {
          _id: 'Sandbox/WebHome',
          title: 'Sandbox',
          _last_modified: Date.parse('2009-09-09T02:00:00-04:00'),
          author: 'XWiki.Admin',
          version: '1.1'
        }
      ]
    }, "AllDocs query");

    o.jio.allDocs({query: '(not: "tested")'}, o.f);

    o.clock.tick(5000);
    o.server.respond();
    ok(o.f.called, "spy called");
    o.assertReqs(1, "one REST request for allDocs");

    util.closeAndcleanUpJio(o.jio);
  });

}));
