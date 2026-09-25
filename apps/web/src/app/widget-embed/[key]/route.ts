import { NextResponse } from 'next/server';

function script(widgetKey: string): string {
  return `(function () {
  var key = ${JSON.stringify(widgetKey)};
  var poll = 30000;
  var host = window.__INV_ORIGIN__ || window.location.origin;
  var container = document.getElementById("inv-widget-cont");
  if (!container) return;

  function money(n, c) {
    try {
      return new Intl.NumberFormat(window.navigator.language || "en-IN", {
        style: "currency",
        currency: c || "INR"
      }).format(n);
    } catch (e) {
      return (c || "INR") + " " + n;
    }
  }

  function render() {
    fetch(host + "/api/widget/" + key, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var accent = container.getAttribute("data-accent") || "#4d8a63";
        var showPrice = (container.getAttribute("data-show-price") || "true") === "true";
        var labels = {
          inStock: container.getAttribute("data-in-stock") || "In stock",
          lowStock: container.getAttribute("data-low-stock") || "Low stock",
          out: container.getAttribute("data-out-stock") || "Out of stock"
        };
        var list = (data && data.stock) || [];
        if (list.length === 0) {
          container.innerHTML = '<p style="color:#8c8471;font-size:13px">No products yet</p>';
          return;
        }
        var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px">';
        list.forEach(function (s) {
          var label;
          var color;
          if (!s.in_stock) { label = labels.out; color = "#c8503c"; }
          else if (s.low_stock) { label = labels.lowStock; color = "#dd8426"; }
          else { label = labels.inStock; color = accent; }
          html += '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #ece6d8">';
          html += '<span style="color:#16201f;font-weight:500">' + s.name + '</span>';
          html += '<span style="display:flex;gap:8px;align-items:center">';
          if (showPrice && s.price != null) {
            html += '<span style="color:#8c8471">' + money(s.price, s.currency) + '</span>';
          }
          html += '<span style="display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;color:' + color + ';background:' + color + '1a">' + label + '</span>';
          html += '</span></div>';
        });
        html += '</div>';
        container.innerHTML = html;
      })
      .catch(function () {
        // transient: retried on next poll
      });
  }

  render();
  setInterval(render, poll);
})();`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return new NextResponse(script(key), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}