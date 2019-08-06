const isUrl = require('./utils/isUrl.js');
const ErrorHandler = require('./utils/ErrorHandler.js');
const request = require('request');
const path = require('path');
const url = require('url');

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

    if (this.arguments[2]) {
      if (!isUrl(this.arguments[2])) {
        ErrorHandler.throw(new Error('Given argument is not of type URL.'));
      } else {
        this.url = new URL(this.arguments[2]);
        // Set the base URL
        if (this.url.toString().startsWith('http://') | this.url.toString().startsWith('https://')) {
          this.base_url = this.url.protocol + '//' + this.url.hostname;
        } else {
          this.base_url = '//' + this.url.hostname;
        }
        this.getFonts()
      }
    } else {
      ErrorHandler.throw(new Error('No URL given.'));
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
    var links = html.match(/((?<=href=")|(?<=src=")|(?<=data-src="))(\S+)(?=")/gim);
    var modifiedLinks = [];
    if (!links) {
      return [];
    } else {
      links.forEach(link => {
        if (link.startsWith('/') && !link.startsWith('//')) {
          modifiedLinks.push(this.base_url + link);
        } else {
          modifiedLinks.push(link);
        }
      });
    }
    console.log('Found ' + modifiedLinks.length + ' links.')
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
      const extension = path.extname(link);
      if (['.css'].includes(extension)) {
        css.push(link);
      }
    })
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
        // Only check the CSS files
        if (['.css'].includes(path.extname(file))) {
          getContentPromises.push(this.getContents(file))
        }
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
      })
    }).catch(() => {
    })
  }
}

module.exports = FontScraper;
