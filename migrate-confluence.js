// Script for converting Confluence wiki export to wikijs
// Written by Jacob M. Miller, Cleland Lab, UChicago
// Inspired by https://github.com/gkpln3/ConfluenceToWikiJS

// requirements
const path = require('path');
const fs = require('fs');
var HTMLParser = require('node-html-parser');
var beautify = require('js-beautify').html;

// cli arguments
const directoryPath = process.argv[2];
const outDirectoryPath = process.argv[3];

// regex for invalid characters in filenames
const invalidchar = /[`~!@#$%^&*()|+\=?;:'",<>\{\}\[\]\\\/]/gi;

// make output directory if it doesn't exist
if (fs.existsSync(outDirectoryPath)) {
    console.log("Directory exists.");
  } else {
    console.log("Directory does not exist. Creating " + outDirectoryPath);
    fs.mkdirSync(outDirectoryPath, {recursive: true});
  }

fs.readdir(directoryPath, function (err, files) {
    //handling error
    if (err) {
        return console.log('Unable to scan directory: ' + err);
    }

    //listing all files using forEach
    files.forEach(function (file) {
        if (file.endsWith(".html") && file !== "index.html") {
            //console.log("Converting " + file);
            fs.readFile(path.join(directoryPath, file), "utf8", function(err, data) {
                parsedHtml = HTMLParser.parse(data);

                // get page title in readable and filename formats
                page_title = parsedHtml.querySelector("head").querySelector("title").rawText;
                page_title = page_title.substr(page_title.search(" : ") + 3);
                page_title_spaces = page_title.replace(/[_\s\.]/g, ' ');
                page_title = page_title.replace(invalidchar, '').replace(/[_\s]/g, '-').replace(/\./g, '').replace(/\u03BC|\u00B5/g, "u");

                // generate tag that wikijs uses to read page title
                page_data = "<!--\ntitle: " + page_title_spaces + "\n-->";

                // use breadcrumbs element to build the page path for the wikijs structure
                folderpath = parsedHtml.getElementById("breadcrumbs");
                breadcrumbs = folderpath.getElementsByTagName("li");
                breadcrumbs.splice(0,2);

                page_path = "";
                for (let i = 0; i < breadcrumbs.length; i++) {
                  page_path += breadcrumbs[i].textContent.trim().replace(invalidchar,'').replace(/[_\s]/g, '-').replace(/\./g, '').replace(/\u03BC|\u00B5/g, "u") + "/";
                }

                // make sure output directory exists
                pageDirectoryPath = outDirectoryPath + page_path;
                if (!fs.existsSync(pageDirectoryPath)) {
                    fs.mkdirSync(pageDirectoryPath, {recursive: true});
                }

                //
                //
                // fix images (downloads doesnt work "Cryo RuO2 Thermometer")
                //
                //

                // get all elements with src tag
                srcelements = parsedHtml.querySelector("#main-content").querySelectorAll("[src]");

                // regex for possible attachment directories
                // based on Confluence export format as of July 2022
                validdir = /^((download[\/\\]temp\/)|(attachments[\/\\][0-9]+\/))[^\/\\]+$/;


                for (let i = 0; i < srcelements.length; i++) {
                  // get asset path
                  src = srcelements[i].getAttribute("src").trim();

                  // skip if src is referring to invalid directory
                  if (!validdir.test(src)) {
                    //console.log("Non-copy dir: " + src);
                    continue;
                  }

                  // get asset filename
                  srcsplit = src.split('/');
                  srcnamesplit = srcsplit[srcsplit.length-1].split(".");

                  // skip if id is invalid
                  if (srcnamesplit.length > 2) {
                    console.log("src filename contains periods: " + src);
                    continue;
                  }

                  // record id and extension
                  srcid = srcnamesplit[0];
                  if (srcnamesplit.length == 1) {
                    srcext = "";
                  } else {
                    srcext = "." + srcnamesplit[1].toLowerCase();
                  }
                  src_lowerext =  src.split(".")[0]+srcext;

                  // set default filename
                  srcfilename = srcid;

                  // try to get filename from html element
                  srcalias = srcelements[i].getAttribute("data-linked-resource-default-alias");
                  if (typeof(srcalias) != "undefined") {
                    // get ID of file in case no filename is found
                    srcfilename = srcalias.split(".")[0];
                  }

                  // remove invalid characters and replace whitespaces with hyphens
                  srcfilename = srcfilename.replace(invalidchar,'').replace(/[_\s]/g, '-');

                  // define source and destination
                  assetsource = path.join(directoryPath, src_lowerext);
                  assetdest = path.join(outDirectoryPath, page_path+srcfilename+srcext);

                  // move file and rename corresponding src element
                  try {
                    fs.copyFileSync(assetsource, assetdest, fs.constants.COPYFILE_EXCL);
                    srcelements[i].setAttribute("src", "/"+page_path+srcfilename+srcext);
                  } catch (err) {
                    if (err.code !== "EEXIST") {
                      console.log("Couldn't move " + assetsource + " to " + assetdest);
                      console.log(err.code);
                    }
                  }
                }

                //
                //
                // fix previewed attachements like pdfs
                //
                //

                // get elements that are displayed as previews in confluence
                previewelements = parsedHtml.querySelector("#main-content").querySelectorAll(".confluence-embedded-file");

                // resource ids are numeric
                validresourceid = /[0-9]+/;

                for (let i = 0; i < previewelements.length; i++) {

                  // if the preview element is incomplete, skip it
                  if (previewelements[i].getAttribute("href") == undefined | previewelements[i].getAttribute("data-linked-resource-container-id") == undefined | previewelements[i].getAttribute("data-linked-resource-id") == undefined ) {
                    console.log("Unconvertable href: " + previewelements[i].getAttribute("data-linked-resource-default-alias"));
                    continue;
                  }

                  // get element info
                  data_linked_resource_container_id = previewelements[i].getAttribute("data-linked-resource-container-id").trim();
                  data_linked_resource_id = previewelements[i].getAttribute("data-linked-resource-id").trim();
                  previewelement_split = previewelements[i].getAttribute("data-linked-resource-default-alias").split(".");
                  previewelement_ext = "." + previewelement_split[previewelement_split.length-1].toLowerCase();
                  previewelement_filename_full = previewelements[i].getAttribute("data-linked-resource-default-alias").trim().replace(invalidchar,'').replace(/[_\s]/g, '-').replace(/\u03BC|\u00B5/g, "u");
                  previewelement_filename = previewelement_filename_full.split(".")[0]+previewelement_ext;

                  // build element source path
                  previewelement_path = "attachments/" + data_linked_resource_container_id + "/" + data_linked_resource_id + previewelement_ext;

                  // move file to destination directory and convert href to new location
                  if (validresourceid.test(data_linked_resource_container_id) && validresourceid.test(data_linked_resource_id)) {
                    assetsource = path.join(directoryPath, previewelement_path);
                    assetdest = path.join(outDirectoryPath, page_path+previewelement_filename);
                    try {
                      fs.copyFileSync(assetsource, assetdest, fs.constants.COPYFILE_EXCL);
                      previewelements[i].setAttribute("href", "/"+page_path+previewelement_filename);
                      //console.log("Added resource at " + page_path+previewelement_filename);
                    } catch (err) {
                      if (err.code !== "EEXIST") {
                        console.log("Couldn't move " + assetsource + " to " + assetdest);
                        console.log(err);
                      }
                    }
                  } else {
                    console.log("Found invalid file path: " + previewelement_path);
                  }

                  // remove preview image - instead of clicking an image, replace with a link
                  preview_img = previewelements[i].querySelector("img");
                  if (preview_img != null) {
                    previewelements[i].querySelector("img").remove();
                  }
                  preview_label = previewelements[i].querySelector("span.title");
                  preview_label_node = '<span class="title">'+previewelement_filename+'</span><br>';
                  if (preview_label == null) {
                    previewelements[i].appendChild(HTMLParser.parse(preview_label_node));
                  } else {
                    preview_label.replaceWith(HTMLParser.parse(preview_label_node));
                  }

                }

                //
                //
                // TODO: fix slides: vf-slide-viewer-macro (e.g., electronics/bobox)
                //
                //

                // some previewed files are in a different class - specifically ppt and pdf presentations
                pptelements = parsedHtml.querySelector("#main-content").querySelectorAll(".vf-slide-viewer-macro");
                for (let i = 0; i < pptelements.length; i++) {

                  data_page_id = pptelements[i].getAttribute("data-page-id").trim();
                  data_attachment_id = pptelements[i].getAttribute("data-attachment-id").trim();
                  pptelement_split = pptelements[i].getAttribute("data-attachment").split(".");
                  pptelement_ext = "." + pptelement_split[pptelement_split.length-1].toLowerCase();
                  pptelement_filename_full = pptelements[i].getAttribute("data-attachment").trim().replace(invalidchar,'').replace(/[_\s]/g, '-').replace(/\u03BC|\u00B5/g, "u");
                  pptelement_filename = pptelement_filename_full.split(".")[0]+previewelement_ext;

                  pptelement_path = "attachments/" + data_page_id + "/" + data_attachment_id + pptelement_ext;

                  // move attachment to destination directory and replace preview element with a simple link element
                  if (validresourceid.test(data_page_id) && validresourceid.test(data_attachment_id)) {
                    assetsource = path.join(directoryPath, pptelement_path);
                    assetdest = path.join(outDirectoryPath, page_path+pptelement_filename);
                    try {
                      fs.copyFileSync(assetsource, assetdest, fs.constants.COPYFILE_EXCL);
                      ppt_node = '<a href="' + "/"+page_path+pptelement_filename + '"><span class="title">'+pptelement_filename+'</span><br></a>';
                      pptelements[i].replaceWith(HTMLParser.parse(ppt_node));
                      //console.log("Added resource at " + page_path+previewelement_filename);
                    } catch (err) {
                      if (err.code !== "EEXIST") {
                        console.log("Couldn't move " + assetsource + " to " + assetdest);
                        console.log(err);
                      }
                    }
                  } else {
                    console.log("Found invalid file path: " + previewelement_path);
                  }
                }


                //
                //
                // fix href file and intra-wiki page links
                //
                //

                // get all elements with href tag
                hrefelements = parsedHtml.querySelector("#main-content").querySelectorAll("[href]");

                // regex to distinguish html references from others
                validhtmlpage = /^[^\/\\]+.html$/

                for (let i = 0; i < hrefelements.length; i++) {
                  href = hrefelements[i].getAttribute("href").trim();
                  hrefsplit = href.split('/');

                  // if not linking to attachment, check if its a page link
                  if (!validdir.test(href)) {

                    // check if href is linking to another wiki page and build its destination directory
                    // the same way we did for the current page. Then replace the href with the destination directory.
                    if (validhtmlpage.test(href) && href !== "index.html") {
                      try {
                        hrefdata = fs.readFileSync(path.join(directoryPath, href), {encoding:'utf8', flag:'r'});
                        hrefHtml = HTMLParser.parse(hrefdata);

                        hrefpage_title = hrefHtml.querySelector("head").querySelector("title").rawText;
                        hrefpage_title = hrefpage_title.substr(hrefpage_title.search(" : ") + 3);
                        hrefpage_title = hrefpage_title.replace(invalidchar, '').replace(/[_\s]/g, '-').replace(/\./g, '').replace(/\u03BC|\u00B5/g, "u");

                        hreffolderpath = hrefHtml.getElementById("breadcrumbs");

                        hrefbreadcrumbs = hreffolderpath.getElementsByTagName("li");
                        hrefbreadcrumbs.splice(0,2);

                        hrefpage_path = "";
                        for (let i = 0; i < hrefbreadcrumbs.length; i++) {
                          hrefpage_path += hrefbreadcrumbs[i].textContent.trim().replace(invalidchar,'').replace(/[_\s]/g, '-').replace(/\./g, '').replace(/\u03BC|\u00B5/g, "u") + "/";
                        }

                        hrefnew = "/" + hrefpage_path + hrefpage_title + ".html";
                        hrefelements[i].setAttribute("href", hrefnew);

                        //console.log("HTML link switched: " + href + " to " + hrefnew);
                      } catch (err) {
                        console.log("Couldn't read file " + href)
                        console.log(err)
                      }
                    }

                    // dont need to copy href to another page
                    continue;
                  }

                  // if href is for a file

                  // try to get filename from element tag, otherwise use its numeric id
                  hreffileid = hrefsplit[hrefsplit.length-1];
                  hreffilename = hrefelements[i].getAttribute("data-linked-resource-default-alias");
                  if (typeof hreffilename == "undefined") {
                    hreffilename = hreffileid;
                  }

                  // fix invalid characters in filename
                  hreffilename = hreffilename.replace(invalidchar,'').replace(/[_\s]/g, '-');

                  // source and destination paths
                  assetsource = path.join(directoryPath, href);
                  assetdest = path.join(outDirectoryPath, page_path+hreffilename);

                  // move file and change href link
                  try {
                    fs.copyFileSync(assetsource, assetdest, fs.constants.COPYFILE_EXCL);
                    hrefelements[i].setAttribute("href", "/"+page_path+hreffilename);
                  } catch (err) {
                    if (err.code !== "EEXIST") {
                      console.log("Couldn't move " + assetsource + " to " + assetdest);
                      console.log(err);
                    }
                  }
                }

                // concatenate HTML contents with page data
                page_data = page_data + parsedHtml.querySelector("#main-content").innerHTML;

                // write page after beautifying
                fs.writeFileSync(path.join(outDirectoryPath, page_path + page_title + ".html"), beautify(page_data, { indent_size: 2, space_in_empty_paren: true }));

            });
        }
    });
});
