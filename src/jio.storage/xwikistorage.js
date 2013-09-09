/*jslint indent: 2,
    maxlen: 80,
    nomen: true
*/
/*global
    define: true,
    jIO: true,
    jQuery: true,
    XMLHttpRequest: true,
    Blob: true,
    FormData: true,
    window: true,
    complex_queries
*/
/**
 * JIO XWiki Storage. Type = 'xwiki'.
 * XWiki Document/Attachment storage.
 */
(function (dependencies, module) {
  "use strict";
  if (typeof define === 'function' && define.amd) {
    return define(dependencies, module);
  }
  module(jQuery, jIO, complex_queries);
}(['jquery', 'jio', 'complex_queries'], function ($, jIO, ComplexQueries) {
  "use strict";

  jIO.addStorageType('xwiki', function (spec, my) {

    spec = spec || {};
    var that, priv, xwikistorage;

    that = my.basicStorage(spec, my);
    priv = {};

    /**
     * Get the Space and Page components of a documkent ID.
     *
     * @param id the document id.
     * @return a map of { 'space':<Space>, 'page':<Page> }
     */
    priv.getParts = function (id) {
      if (id.indexOf('/') === -1) {
        return {
          space: 'Main',
          page: id
        };
      }
      return {
        space: id.substring(0, id.indexOf('/')),
        page: id.substring(id.indexOf('/') + 1)
      };
    };

    /**
     * Get the Anti-CSRF token and do something with it.
     *
     * @param andThen function which is called with (formToken, err)
     *                as parameters.
     */
    priv.doWithFormToken = function (andThen) {
      $.ajax({
        url: priv.formTokenPath,
        type: "GET",
        async: true,
        dataType: 'text',
        success: function (html) {
          var m, token;
          // this is unreliable
          //var token = $('meta[name=form_token]', html).attr("content");
          m = html.match(/<meta name="form_token" content="(\w*)"\/>/);
          token = (m && m[1]) || null;
          if (!token) {
            andThen(null, {
              "status": 404,
              "statusText": "Not Found",
              "error": "err_form_token_not_found",
              "message": "Anti-CSRF form token was not found in page",
              "reason": "XWiki main page did not contain expected " +
                        "Anti-CSRF form token"
            });
          } else {
            andThen(token, null);
          }
        },
        error: function (jqxhr, err, cause) {
          andThen(null, {
            "status": jqxhr.status,
            "statusText": jqxhr.statusText,
            "error": err,
            "message": "Could not get Anti-CSRF form token from [" +
                priv.xwikiurl + "]",
            "reason": cause
          });
        },
      });
    };

    /**
     * Get the REST read URL for a document.
     *
     * @param docId the id of the document.
     * @return the REST URL for accessing this document.
     */
    priv.getDocRestURL = function (docId) {
      var parts = priv.getParts(docId);
      return priv.xwikiurl + '/rest/wikis/'
        + priv.wiki + '/spaces/' + parts.space + '/pages/' + parts.page;
    };

    /**
     * Make an HTML5 Blob object.
     * Equivilant to the `new Blob()` constructor.
     * Will fall back on deprecated BlobBuilder if necessary.
     */
    priv.makeBlob = function (contentArray, options) {
      var i, bb, BB;
      try {
        // use the constructor if possible.
        return new Blob(contentArray, options);
      } catch (err) {
        // fall back on the blob builder.
        BB = (window.MozBlobBuilder || window.WebKitBlobBuilder
          || window.BlobBuilder);
        bb = new BB();
        for (i = 0; i < contentArray.length; i += 1) {
          bb.append(contentArray[i]);
        }
        return bb.getBlob(options ? options.type : undefined);
      }
    };

    priv.isBlob = function (potentialBlob) {
      return typeof (potentialBlob) !== 'undefined' &&
        potentialBlob.toString() === "[object Blob]";
    };

    /*
     * Wrapper for the xwikistorage based on localstorage JiO store.
     */
    xwikistorage = {
      /**
       * Get content of an XWikiDocument.
       *
       * @param docId the document ID.
       * @param andThen a callback taking (doc, err), doc being the document
       *                json object and err being the error if any.
       */
      getItem: function (docId, andThen) {

        var success = function (jqxhr) {
          var out, xd;
          out = {};
          try {
            xd = $(jqxhr.responseText);
            xd.find('modified').each(function () {
              out._last_modified = Date.parse($(this).text());
            });
            xd.find('created').each(function () {
              out._creation_date = Date.parse($(this).text());
            });
            xd.find('title').each(function () { out.title = $(this).text(); });
            xd.find('parent').each(function () {
              out.parent = $(this).text();
            });
            xd.find('syntax').each(function () {
              out.syntax = $(this).text();
            });
            xd.find('content').each(function () {
              out.content = $(this).text();
            });
            out._id = docId;
            andThen(out, null);
          } catch (err) {
            andThen(null, {
              status: 500,
              statusText: "internal error",
              error: err,
              message: err.message,
              reason: ""
            });
          }
        };

        $.ajax({
          url: priv.getDocRestURL(docId),
          dataType: 'xml',

          // Use complete instead of success and error because phantomjs
          // sometimes causes error to be called with html return code 200.
          complete: function (jqxhr, statusText) {
            if (jqxhr.status === 404) {
              andThen(null, null);
              return;
            }
            if (jqxhr.status !== 200) {
              andThen(null, {
                "status": jqxhr.status,
                "statusText": statusText,
                "error": "",
                "message": "Failed to get document [" + docId + "]",
                "reason": ""
              });
              return;
            }
            success(jqxhr);
          }
        });
      },

      /**
       * Get content of an XWikiAttachment.
       *
       * @param attachId the attachment ID.
       * @param andThen a callback taking (attach, err), attach being the
       *                attachment blob and err being the error if any.
       */
      getAttachment: function (docId, fileName, andThen) {
        var xhr, parts, url;
        // need to do this manually, jquery doesn't support returning blobs.
        xhr = new XMLHttpRequest();
        parts = priv.getParts(docId);
        url = priv.xwikiurl + '/bin/download/' + parts.space +
            "/" + parts.page + "/" + fileName + '?cb=' + Math.random();
        xhr.open('GET', url, true);
        if (priv.useBlobs) {
          xhr.responseType = 'blob';
        } else {
          xhr.responseType = 'text';
        }

        xhr.onreadystatechange = function (e) {
          if (xhr.readyState < 4) { return; }
          if (xhr.status === 200) {
            var contentType = xhr.getResponseHeader("Content-Type");
            if (contentType.indexOf(';') > -1) {
              contentType = contentType.substring(0, contentType.indexOf(';'));
            }
            andThen(undefined,
                    (priv.useBlobs) ? xhr.response : xhr.responseText);
          } else {
            andThen({
              "status": xhr.status,
              "statusText": xhr.statusText,
              "error": "err_network_error",
              "message": "Failed to get attachment ["
                  + docId + "/" + fileName + "]",
              "reason": "Error getting data from network"
            });
          }
        };

        xhr.send();
      },

      /**
       * Store an XWikiDocument.
       *
       * @param id the document identifier.
       * @param doc the document JSON object containing
       *            "parent", "title", "content", and/or "syntax" keys.
       * @param andThen a callback taking (err), err being the error if any.
       */
      setItem: function (id, doc, andThen) {
        priv.doWithFormToken(function (formToken, err) {
          if (err) {
            that.error(err);
            return;
          }
          var parts = priv.getParts(id);
          $.ajax({
            url: priv.xwikiurl + "/bin/preview/" +
              parts.space + '/' + parts.page,
            type: "POST",
            async: true,
            dataType: 'text',
            data: {
              parent: doc.parent || '',
              title: doc.title || '',
              xredirect: '',
              language: 'en',
              content: doc.content || '',
              xeditaction: 'edit',
              comment: 'Saved by JiO',
              action_saveandcontinue: 'Save & Continue',
              syntaxId: doc.syntax || 'xwiki/2.1',
              xhidden: 0,
              minorEdit: 0,
              ajax: true,
              form_token: formToken
            },
            success: function () {
              andThen(null);
            },
            error: function (jqxhr, err, cause) {
              andThen({
                "status": jqxhr.status,
                "statusText": jqxhr.statusText,
                "error": err,
                "message": "Failed to store document [" + id + "]",
                "reason": cause
              });
            }
          });
        });
      },

      /**
       * Store an XWikiAttachment.
       *
       * @param docId the ID of the document to attach to.
       * @param fileName the attachment file name.
       * @param mimeType the MIME type of the attachment content.
       * @param content the attachment content.
       * @param andThen a callback taking one parameter, the error if any.
       */
      setAttachment: function (docId, fileName, mimeType, content, andThen) {
        priv.doWithFormToken(function (formToken, err) {
          var parts, blob, fd, xhr;
          if (err) {
            that.error(err);
            return;
          }
          parts = priv.getParts(docId);
          blob = priv.isBlob(content)
            ? content
            : priv.makeBlob([content], {type: mimeType});
          fd = new FormData();
          fd.append("filepath", blob, fileName);
          fd.append("form_token", formToken);
          xhr = new XMLHttpRequest();
          xhr.open('POST', priv.xwikiurl + "/bin/upload/" +
                           parts.space + '/' + parts.page, true);
          xhr.onreadystatechange = function (e) {
            if (xhr.readyState < 4) { return; }
            if (xhr.status === 302 || xhr.status === 200) {
              andThen(null);
            } else {
              andThen({
                "status": xhr.status,
                "statusText": xhr.statusText,
                "error": "err_network_error",
                "message": "Failed to store attachment ["
                    + docId + "/" + fileName + "]",
                "reason": "Error posting data"
              });
            }
          };
          xhr.send(fd);
        });
      },

      removeItem: function (id, andThen) {
        priv.doWithFormToken(function (formToken, err) {
          if (err) {
            that.error(err);
            return;
          }
          var parts = priv.getParts(id);
          $.ajax({
            url: priv.xwikiurl + "/bin/delete/" +
              parts.space + '/' + parts.page,
            type: "POST",
            async: true,
            dataType: 'text',
            data: {
              confirm: '1',
              form_token: formToken
            },
            success: function () {
              andThen(null);
            },
            error: function (jqxhr, err, cause) {
              andThen({
                "status": jqxhr.status,
                "statusText": jqxhr.statusText,
                "error": err,
                "message": "Failed to delete document [" + id + "]",
                "reason": cause
              });
            }
          });
        });
      },

      removeAttachment: function (docId, fileName, andThen) {
        var parts = priv.getParts(docId);
        priv.doWithFormToken(function (formToken, err) {
          if (err) {
            that.error(err);
            return;
          }
          $.ajax({
            url: priv.xwikiurl + "/bin/delattachment/" + parts.space + '/' +
                parts.page + '/' + fileName,
            type: "POST",
            async: true,
            dataType: 'text',
            data: {
              ajax: '1',
              form_token: formToken
            },
            success: function () {
              andThen(null);
            },
            error: function (jqxhr, err, cause) {
              andThen({
                "status": jqxhr.status,
                "statusText": jqxhr.statusText,
                "error": err,
                "message": "Failed to delete attachment ["
                    + docId + '/' + fileName + "]",
                "reason": cause
              });
            }
          });
        });
      }
    };

    // ==================== Tools ====================
    /**
     * Update [doc] the document object and remove [doc] keys
     * which are not in [new_doc]. It only changes [doc] keys not starting
     * with an underscore.
     * ex: doc:     {key:value1,_key:value2} with
     *     new_doc: {key:value3,_key:value4} updates
     *     doc:     {key:value3,_key:value2}.
     * @param  {object} doc The original document object.
     * @param  {object} new_doc The new document object
     */
    priv.documentObjectUpdate = function (doc, new_doc) {
      var k;
      for (k in doc) {
        if (doc.hasOwnProperty(k)) {
          if (k[0] !== '_') {
            delete doc[k];
          }
        }
      }
      for (k in new_doc) {
        if (new_doc.hasOwnProperty(k)) {
          if (k[0] !== '_') {
            doc[k] = new_doc[k];
          }
        }
      }
    };

    /**
     * Checks if an object has no enumerable keys
     * @method objectIsEmpty
     * @param  {object} obj The object
     * @return {boolean} true if empty, else false
     */
    priv.objectIsEmpty = function (obj) {
      var k;
      for (k in obj) {
        if (obj.hasOwnProperty(k)) {
          return false;
        }
      }
      return true;
    };

    /**
     * Convert a JIO query to an XWiki XWQK query.
     *
     * @method convertToXWQLQuery
     * @param {object} the query object
     * @return {string} an XWiki XWQL query string
     */
    priv.convertToXWQLQuery = function (option) {
      var out = '', i;
      option.query = complex_queries.QueryFactory.create(option.query || "");
      if (typeof option.wildcard_character !== 'string') {
        option.wildcard_character = '%';
      }
      function isNumeric(x) {
        return String(parseFloat(x)) === String(x);
      }
      function quote(x) {
        if (isNumeric(x)) { return x; }
        return "'" + x.replace(/\\/g, '\\\\').replace(/\'/g, "\\'") + "'";
      }
      function parseQuery(q) {

        if (q.operator === '=' &&
            q.value.indexOf(option.wildcard_character) > -1) {
          return 'doc.' + q.key + ' LIKE ' + quote(
            q.value.split(option.wildcard_character).map(
              function (x) { return x.replace(/%/g, '\\%'); }
            ).join('%')
          );
        }

        switch (q.operator) {
        case 'AND':
        case 'OR':
          return (function () {
            var out = '', i;
            for (i = 0; i < q.query_list.length; i += 1) {
              if (i > 0) { out += ' ' + q.operator + ' '; }
              out += '(' + parseQuery(q.query_list[i]) + ')';
            }
            return out;
          }());

        case 'NOT':
          return 'NOT(' + parseQuery(q.query_list[0]) + ')';

        case '=':
        case '!=':
        case '<':
        case '>':
        case '<=':
        case '>=':
          return 'doc.' + q.key + ' ' + q.operator + ' ' + quote(q.value);

        case undefined:
          return '1=1';

        default:
          throw new Error("unexpected operator in query " + JSON.stringify(q));
        }
      }
      out = 'WHERE ' + parseQuery(option.query);
      if (Array.isArray(option.sort_on)) {
        for (i = 0; i < option.sort_on.length; i += 1) {
          out += ((i > 0) ? ', ' : ' ORDER BY ') + 'doc.' +
            option.sort_on[i][0];
          out += (option.sort_on[i][1] === 'descending') ? ' DESC' : ' ASC';
        }
      }
      return out;
    };

    /**
     * Convert a JIO query to an XWiki REST query.
     *
     * @method convertToXWikiRestQuery
     * @param {object} the query object
     * @return {string} an XWiki REST query URL
     */
    priv.convertToXWikiRestQuery = function (option) {
      var url = priv.xwikiurl + '/rest/wikis/' + priv.wiki + '/query?q=' +
          encodeURIComponent(priv.convertToXWQLQuery(option)) + '&type=xwql';
      if (Array.isArray(option.limit)) {
        url += '&start=' + option.limit[0] + '&number=' + option.limit[1];
      }
      return url;
    };

    // ==================== attributes ====================
    // the wiki to store stuff in
    priv.wiki = spec.wiki || 'xwiki';

    // unused
    priv.username = spec.username;
    priv.language = spec.language;

    // URL location of the wiki, unused since
    // XWiki doesn't currently allow cross-domain requests.
    priv.xwikiurl = spec.url ||
       window.location.href.replace(/\/xwiki\/bin\//, '/xwiki\n')
         .split('\n')[0];
    // should be: s@/xwiki/bin/.*$@/xwiki@
    // but jslint gets in the way.

    // Which URL to load for getting the Anti-CSRF form token, used for testing.
    priv.formTokenPath = spec.formTokenPath || priv.xwikiurl;

    // If true then Blob objects will be returned by
    // getAttachment() rather than strings.
    priv.useBlobs = spec.useBlobs || false;


    that.specToStore = function () {
      return {
        "username": priv.username,
        "language": priv.language,
        "url": priv.url,
        "useBlobs": priv.useBlobs,
        "formTokenPath": priv.formTokenPath
      };
    };

    // can't fo wrong since no parameters are required.
    that.validateState = function () {
      return '';
    };

    // ==================== commands ====================
    /**
     * Create a document in local storage.
     * @method post
     * @param  {object} command The JIO command
     */
    that.post = function (command) {
      var docId = command.getDocId();
      if (!(typeof docId === "string" && docId !== "")) {
        setTimeout(function () {
          that.error({
            "status": 405,
            "statusText": "Method Not Allowed",
            "error": "method_not_allowed",
            "message": "Cannot create document which id is undefined",
            "reason": "Document id is undefined"
          });
        });
        return;
      }
      xwikistorage.getItem(docId, function (doc, err) {
        if (err) {
          that.error(err);
        } else if (doc === null) {
          // the document does not exist
          xwikistorage.setItem(command.getDocId(),
                               command.cloneDoc(),
                               function (err) {
              if (err) {
                that.error(err);
              } else {
                that.success({
                  "ok": true,
                  "id": command.getDocId()
                });
              }
            });
        } else {
          // the document already exists
          that.error({
            "status": 409,
            "statusText": "Conflicts",
            "error": "conflicts",
            "message": "Cannot create a new document",
            "reason": "Document already exists (use 'put' to modify it)"
          });
        }
      });
    };

    /**
     * Create or update a document in local storage.
     * @method put
     * @param  {object} command The JIO command
     */
    that.put = function (command) {
      xwikistorage.getItem(command.getDocId(), function (doc, err) {
        if (err) {
          that.error(err);
        } else if (doc === null) {
          doc = command.cloneDoc();
        } else {
          priv.documentObjectUpdate(doc, command.cloneDoc());
        }
        // write
        xwikistorage.setItem(command.getDocId(), doc, function (err) {
          if (err) {
            that.error(err);
          } else {
            that.success({
              "ok": true,
              "id": command.getDocId()
            });
          }
        });
      });
    };

    /**
     * Add an attachment to a document
     * @method  putAttachment
     * @param  {object} command The JIO command
     */
    that.putAttachment = function (command) {
      xwikistorage.getItem(command.getDocId(), function (doc, err) {
        if (err) {
          that.error(err);
        } else if (doc === null) {
          //  the document does not exist
          that.error({
            "status": 404,
            "statusText": "Not Found",
            "error": "not_found",
            "message": "Impossible to add attachment",
            "reason": "Document not found"
          });
        } else {
          // Document exists, upload attachment.
          xwikistorage.setAttachment(command.getDocId(),
                                     command.getAttachmentId(),
                                     command.getAttachmentMimeType(),
                                     command.getAttachmentData(),
                                     function (err) {
              if (err) {
                that.error(err);
              } else {
                that.success({
                  "ok": true,
                  "id": command.getDocId() + "/" + command.getAttachmentId()
                });
              }
            });
        }
      });
    };

    /**
     * Get a document or attachment
     * @method get
     * @param  {object} command The JIO command
     */
    that.get = that.getAttachment = function (command) {
      if (typeof command.getAttachmentId() === "string") {
        // seeking for an attachment
        xwikistorage.getAttachment(command.getDocId(),
                                   command.getAttachmentId(),
                                   function (err, attach) {
            if (err) {
              that.error(err);
            } else if (attach !== undefined) {
              that.success(attach);
            } else {
              that.error({
                "status": 404,
                "statusText": "Not Found",
                "error": "not_found",
                "message": "Cannot find the attachment",
                "reason": "Attachment does not exist"
              });
            }
          });
      } else {
        // seeking for a document
        xwikistorage.getItem(command.getDocId(), function (doc, err) {
          if (err) {
            that.error(err);
          } else if (doc !== null) {
            that.success(doc);
          } else {
            that.error({
              "status": 404,
              "statusText": "Not Found",
              "error": "not_found",
              "message": "Cannot find the document",
              "reason": "Document does not exist"
            });
          }
        });
      }
    };

    /**
     * Remove a document or attachment
     * @method remove
     * @param  {object} command The JIO command
     */
    that.remove = that.removeAttachment = function (command) {
      var notFoundError, objId, complete;
      notFoundError = function (word) {
        that.error({
          "status": 404,
          "statusText": "Not Found",
          "error": "not_found",
          "message": word + " not found",
          "reason": "missing"
        });
      };

      objId = command.getDocId();
      complete = function (err) {
        if (err) {
          that.error(err);
        } else {
          that.success({
            "ok": true,
            "id": objId
          });
        }
      };
      if (typeof command.getAttachmentId() === "string") {
        objId += '/' + command.getAttachmentId();
        xwikistorage.removeAttachment(command.getDocId(),
                                      command.getAttachmentId(),
                                      complete);
      } else {
        xwikistorage.removeItem(objId, complete);
      }
    };



    priv.makeAllDocsResponse = function (jqxhr, option) {
      var rows = [], xd;
      try {
        xd = $(jqxhr.responseText);
        xd.find('searchResult').each(function () {
          var out = {};
          if ($(this).find('type').text() !== 'page') { return; }
          out._last_modified = Date.parse($(this).find('modified').text());
          out.title = $(this).find('title').text();
          out._id = [
            $(this).find('space').text(),
            $(this).find('pageName').text()
          ].map(function (x) { return x.replace(/\//, '\\/'); }).join('/');
          out.author = $(this).find('author').text();
          out.version = $(this).find('version').text();
          rows.push(out);
        });
      } catch (err) {
        that.error({
          status: 500,
          statusText: "internal error",
          error: err,
          message: err.message,
          reason: ""
        });
      }
      function done() {
        that.success({total_rows: rows.length, rows: rows, ok: true});
      }
      if (!option.include_docs || rows.length === 0) {
        return done();
      }

      (function () {
        var waitingFor = 0, error = false, i;
        function f(i) {
          xwikistorage.getItem(rows[i]._id, function (doc, err) {
            if (error) { return; }
            if (err) {
              error = true;
              that.error(err);
              return;
            }
            $.extend(rows[i], doc);
            if ((waitingFor -= 1) === 0) { done(); }
          });
        }
        for (i = 0; i < rows.length; i += 1) { waitingFor += 1; f(i); }
      }());
    };

    /**
     * Get all filenames belonging to a user from the document index
     * @method allDocs
     * @param  {object} command The JIO command
     */
    that.allDocs = function (command) {
      var l = {};
      l.option = command.cloneOption();
      $.ajax({
        url: priv.convertToXWikiRestQuery(l.option),
        type: "GET",
        async: true,
        dataType: 'xml',

        // Use complete instead of success and error because phantomjs
        // sometimes causes error to be called with html return code 200.
        complete: function (jqxhr) {
          if (jqxhr.status !== 200) {
            that.error({
              "status": jqxhr.status,
              "statusText": jqxhr.statusText,
              "error": "",
              "message": "Failed to run search",
              "reason": jqxhr.responseText
            });
            return;
          }
          priv.makeAllDocsResponse(jqxhr, l.option);
        }
      });
    };

    return that;
  });
}));
