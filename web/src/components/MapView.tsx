import { useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { groupByBuilding, hoursLabel, type Door } from "../api";
import type { LatLng } from "../App";

const pumpkinIcon = (mine: boolean, active: boolean, visited: boolean, count: number) =>
  L.divIcon({
    className: `pumpkin ${mine ? "mine" : ""} ${active ? "active" : ""} ${visited ? "visited" : ""}`,
    html: count > 1 ? `🎃<span class="badge">${count}</span>` : "🎃",
    iconSize: [32, 32],
    iconAnchor: [16, 28],
    popupAnchor: [0, -24],
  });

const draftIcon = L.divIcon({
  className: "pumpkin draft",
  html: "📍",
  iconSize: [32, 32],
  iconAnchor: [16, 30],
});

export type Basemap = "satellite" | "streets";

interface Props {
  basemap: Basemap;
  doors: Door[];
  me: LatLng | null;
  myIds: Set<string>;
  visited: Set<string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  draft: LatLng | null;
  onDraftMove?: (p: LatLng) => void;
  flyTo: { target: LatLng; zoom?: number; n: number } | null;
}

// Default view: somewhere sensible before we know where the user is.
const DEFAULT_CENTER: LatLng = { lat: 59.33, lng: 18.07 };

export default function MapView(props: Props) {
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={12} zoomControl={false} className="map">
      {props.basemap === "satellite" ? (
        <>
          <TileLayer
            key="sat"
            attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            maxNativeZoom={18}
          />
          <TileLayer
            key="sat-roads"
            attribution="Roads &copy; Esri, HERE, Garmin, OpenStreetMap contributors"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            pane="shadowPane"
          />
          <TileLayer
            key="sat-places"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            pane="shadowPane"
          />
        </>
      ) : (
        <TileLayer
          key="osm"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
      )}
      <Controller {...props} />
      {props.me && (
        <CircleMarker
          center={props.me}
          radius={8}
          pathOptions={{ color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1 }}
        />
      )}
      {groupByBuilding(props.doors).map((b) => {
        const mine = b.doors.some((d) => props.myIds.has(d.id));
        const active = b.doors.some((d) => d.id === props.selected);
        const allVisited = b.doors.every((d) => props.visited.has(d.id));
        return (
          <Marker
            key={b.key}
            position={b}
            icon={pumpkinIcon(mine, active, allVisited, b.doors.length)}
            eventHandlers={{ click: () => props.onSelect(b.doors[0].id) }}
          >
            <Popup>
              <strong>{b.address}</strong>
              {b.doors.length > 1 && <div className="muted">{b.doors.length} doors in this building</div>}
              <ul className="popup-doors">
                {b.doors.map((d) => (
                  <li key={d.id} className={props.visited.has(d.id) ? "visited" : ""}>
                    {props.visited.has(d.id) && <span title="Visited">✓ </span>}
                    {d.unit && <strong>{d.unit}</strong>}
                    {hoursLabel(d) && <span> {hoursLabel(d)}</span>}
                    {d.intercom_name && <div className="intercom">🔔 Buzz “{d.intercom_name}”</div>}
                    {d.note && <div className="note">{d.note}</div>}
                  </li>
                ))}
              </ul>
            </Popup>
          </Marker>
        );
      })}
      {props.draft && props.onDraftMove && (
        <Marker
          position={props.draft}
          icon={draftIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              props.onDraftMove!({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}

/** Imperative bits: fly-to requests, click-to-place in add mode, popup open on select. */
function Controller({ flyTo, onDraftMove, selected, onSelect }: Props) {
  const map = useMap();

  // Leaflet measures its container once; keep it honest when the pane/sheet resizes.
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    const t = window.setTimeout(() => map.invalidateSize({ animate: false }), 100);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [map]);

  useEffect(() => {
    if (flyTo) map.flyTo(flyTo.target, flyTo.zoom ?? map.getZoom(), { duration: 0.8 });
  }, [flyTo, map]);

  useMapEvents({
    click: (e) => {
      if (onDraftMove) onDraftMove({ lat: e.latlng.lat, lng: e.latlng.lng });
      else if (selected) onSelect(null);
    },
  });

  useEffect(() => {
    if (!selected) return;
    // Open the popup of the selected marker. Marker icons are updated in the
    // markers' own effects, which run after this one, so wait a tick.
    const t = window.setTimeout(() => {
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker && layer.getElement()?.classList.contains("active")) {
          layer.openPopup();
        }
      });
    }, 0);
    return () => window.clearTimeout(t);
  }, [selected, map]);

  return null;
}
