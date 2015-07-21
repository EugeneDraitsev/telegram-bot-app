fs=  require('fs');
d3 = require('d3');
var xmldom = require('xmldom');

var dataset = {
    apples: [53245, 28479, 19697, 24037, 40245],
};

var width = 460,
    height = 300,
    radius = Math.min(width, height) / 2;

var color = d3.scale.category20();

var pie = d3.layout.pie()
    .sort(null);

var arc = d3.svg.arc()
    .innerRadius(radius - 100)
    .outerRadius(radius - 50);

var svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

var path = svg.selectAll("path")
    .data(pie(dataset.apples))
    .enter().append("path")
    .attr("fill", function(d, i) { return color(i); })
    .attr("d", arc);

// get a reference to our SVG object and add the SVG NS  
var svgGraph = d3.select('svg')
    .attr('xmlns', 'http://www.w3.org/2000/svg');
var svgXML = (new xmldom.XMLSerializer()).serializeToString(svgGraph[0][0]);
fs.writeFile('graph.svg', svgXML);