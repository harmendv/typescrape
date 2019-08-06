const isUrl = require('./utils/isUrl.js');
const request = require('request');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const HTML_LINK_ATTRIBUTES = [
  'src',
  'href',
  'data-src',
  'data-href',
];

const FONT_FILE_EXTENSIONS = [
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.eot?#iefix',
];

class FontScraper {
  constructor(args) {
    this.arguments = args;
    this.url;
    this.base_url;
    this.html;
    this.links;
    this.fonts;
    this.output;

    // Check if an URL is given in the second argument
    if (this.arguments[2]) {
      if (!isUrl(this.arguments[2])) {
        throw new Error('Given argument is not of type URL.');
      } else {
        this.url = new URL(this.arguments[2]);
        // Set the base URL
        if (this.url.toString().startsWith('http://') | this.url.toString().startsWith('https://')) {
          this.base_url = this.url.protocol + '//' + this.url.hostname;
        } else {
          this.base_url = '//' + this.url.hostname;
        }
        console.clear();
        console.log('Source: ' + this.url);
        this.getFonts();
      }
    } else {
      new Error('No URL given in first argument');
    }

    // Check if an output path is given
    if(this.arguments[3]) {
      if (!fs.existsSync(path.resolve(this.arguments[3]))) {
        throw new Error('Given output path doesnt exist.');
      }
      this.output = path.resolve(this.arguments[3]);
      console.log('Output: ' + this.arguments[3])
    }

  }

  getContents(path) {
    return new Promise((resolve, reject) => {
      request({
        uri: path
      }, function (error, response) {
        if (error) {
          reject(error);
        }
        resolve(response.body);
      })
    })
  }

  getLinksFromHTML(html) {
    var links = html.match(/(((?<=href=["']))|(?<=src=["'])|(?<=data-src="))(\S+)(?=["'])/gim);
    var modifiedLinks = [];
    if (!links) {
      return [];
    } else {
      links.forEach(link => {
        if (link.startsWith('/') && !link.startsWith('//')) {
          modifiedLinks.push(this.base_url + link);
        } else if (!link.startsWith('/') && !link.startsWith('http') && !link.startsWith('https')) {
          modifiedLinks.push(this.base_url + '/' + link)
        } else {
          modifiedLinks.push(link);
        }
      });
    }
    console.log('Found ' + modifiedLinks.length + ' links.');
    // if(modifiedLinks.length > 0) {
    //   console.log(modifiedLinks);
    // }
    return modifiedLinks;
  }

  getLinksFromCSS(css) {
    var links = css.match(/((?<=url\()(?!')|(?<=url\('))(\S+)(?=\))/gim);
    var modifiedLinks = [];
    if (!links) {
      return [];
    } else {
      links.forEach(link => {
        if (link.endsWith("'")) {
          if (link.startsWith('/') && !link.startsWith('//')) {
            modifiedLinks.push(this.base_url + link.slice(0, -1))
          } else if (!link.startsWith('/') && !link.startsWith('http') && !link.startsWith('https')) {
            modifiedLinks.push(this.base_url + '/' + link.slice(0, -1))
          } else {
            modifiedLinks.push(link.slice(0, -1))
          }
        } else {
          if (link.startsWith('/') && !link.startsWith('//')) {
            modifiedLinks.push(this.base_url + link)
          } else if (!link.startsWith('/') && !link.startsWith('http') && !link.startsWith('https')) {
            modifiedLinks.push(this.base_url + '/' + link)
          } else {
            modifiedLinks.push(link)
          }
        }
      })
    }
    return modifiedLinks;
  }

  findCSSinHTML(links) {
    let css = [];
    links.forEach((link) => {
      if (link.includes('css')) {
        css.push(link);
      }
    })
    console.log('Found ' + css.length + ' CSS file(s)');
    // if(css.length > 0) {
    //   console.log(css);
    // }
    return css;
  }

  findFontsInHTML(links) {
    return new Promise((resolve, reject) => {
      let fonts = [];
      links.forEach((link) => {
        const extension = path.extname(link);
        if (FONT_FILE_EXTENSIONS.includes(extension)) {
          fonts.push(link);
        }
      })
      resolve(fonts);
    })
  }

  findFontsInCSS(links) {
    return new Promise((resolve, reject) => {
      const filePaths = this.findCSSinHTML(links);
      const fonts = [];
      const getLinksPromises = [];
      const getContentPromises = [];

      filePaths.forEach((file) => {
        getContentPromises.push(this.getContents(file))
      })
      Promise.all(getContentPromises).then(values => {
        values.forEach(value => {
          getLinksPromises.push(this.getLinksFromCSS(value));
        })
      }).then(() => {
        Promise.all(getLinksPromises).then(values => {
          values.forEach((value) => {
            value.forEach((cssLink) => {
              const extension = path.extname(cssLink);
              if (FONT_FILE_EXTENSIONS.includes(extension)) {
                fonts.push(cssLink);
              }
            });
          });
        }).then(() => {
          resolve(fonts);
        })
      })
    })
  }

  getFonts() {
    this.getContents(this.url).then((body) => {
      const links = this.getLinksFromHTML(body);
      Promise.all([this.findFontsInHTML(links), this.findFontsInCSS(links)]).then(results => {
        // results[0] is HTML
        console.log('Found ' + results[0].length + ' fonts in directly the HTML.')
        if(results[0].length > 0) {
          console.log(results[0])
        }
        // results[1] is CSS
        console.log('Found ' + results[1].length + ' fonts in CSS files.')
        if(results[1].length > 0) {
          console.log(results[1])
        }
        // Check if output is given, then download to the output!
        if(this.output) {
          results.forEach(resultArray => {
            resultArray.forEach((result) => {
              this.downloadFont(result, path.resolve(this.output, path.basename(result)), (error) => {
                console.log('succesfully download file')
              })
            });
          })
        }
      })
    }).catch(() => {
      throw new Error('Something went wrong getting retrieving the URL');
    })
  }

  downloadFont(url, destination, callback) {
      var file = fs.createWriteStream(destination);
      if(new URL(url).protocol === 'https:') {
        var request = https.get(url, function(response) {
          response.pipe(file);
          file.on('finish', function() {
            file.close(callback);  // close() is async, call cb after close completes.
          });
        }).on('error', function(err) { // Handle errors
          fs.unlink(destination); // Delete the file async. (But we don't check the result)
          if (callback) callback(err.message);
        });
      } else {
        var request = http.get(url, function(response) {
          response.pipe(file);
          file.on('finish', function() {
            file.close(callback);  // close() is async, call cb after close completes.
          });
        }).on('error', function(err) { // Handle errors
          fs.unlink(destination); // Delete the file async. (But we don't check the result)
          if (callback) callback(err.message);
        });
      }

  }
}

module.exports = FontScraper;
