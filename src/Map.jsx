import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import 'mapbox-gl/dist/mapbox-gl.css';

// Firebase config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const Map = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v10',
      center: [36.8219, -1.2921],
      zoom: 6,
    });

    map.current.on('load', () => {
      // Find the first symbol layer to insert heatmap below it (so labels show above)
      const labelLayerId = map.current.getStyle().layers.find(
        layer => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id;

      const incidentsRef = ref(db, 'incidents/');
      onValue(incidentsRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        const features = Object.values(data)
          .filter(i => i.lat && i.lon)
          .map(incident => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [parseFloat(incident.lon), parseFloat(incident.lat)],
            },
            properties: {
              county: incident.county || 'N/A',
              time: incident.time || 'N/A',
              title: incident.title || 'N/A',
              weight: 1,
            },
          }));

        const geojson = {
          type: 'FeatureCollection',
          features,
        };

        // Add or update source
        if (!map.current.getSource('incidents')) {
          map.current.addSource('incidents', {
            type: 'geojson',
            data: geojson,
          });
        } else {
          map.current.getSource('incidents').setData(geojson);
        }

        // Heatmap layer (added below labels)
        if (!map.current.getLayer('heatmap')) {
          map.current.addLayer({
            id: 'heatmap',
            type: 'heatmap',
            source: 'incidents',
            paint: {
              'heatmap-weight': ['get', 'weight'],
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 22, 3],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 22, 40],
              'heatmap-opacity': 0.6,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(0, 0, 255, 0)',
                0.1, 'blue',
                0.3, 'cyan',
                0.5, 'lime',
                0.7, 'yellow',
                0.9, 'orange',
                1, 'red',
              ],
            },
          }, labelLayerId); // Insert below label layer
        }

        // Points layer for interaction
        if (!map.current.getLayer('points')) {
          map.current.addLayer({
            id: 'points',
            type: 'circle',
            source: 'incidents',
            paint: {
              'circle-radius': 6,
              'circle-color': '#000',
              'circle-opacity': 0,
            },
          });
        }

        // Tooltip hover logic
        let popup;
        map.current.on('mousemove', 'points', (e) => {
          const props = e.features[0].properties;
          const coords = e.features[0].geometry.coordinates.slice();

          if (popup) popup.remove();

          popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
            .setLngLat(coords)
            .setHTML(`
              <div style="background-color: rgba(0,0,0,0.85); padding: 14px 16px; border-radius: 10px; color: white; font-family: sans-serif; max-width: 250px;">
                <strong>COUNTY:</strong> ${props.county}<br/>
                <strong>TIME:</strong> ${props.time}<br/>
                <strong>INCIDENT:</strong> ${props.title}
              </div>
            `)
            .addTo(map.current);
        });

        map.current.on('mouseleave', 'points', () => {
          if (popup) {
            popup.remove();
            popup = null;
          }
        });
      });
    });
  }, []);

  return (
    <>
      <div ref={mapContainer} style={{ height: '100vh', width: '100vw' }} />
      <div style={{
        position: 'absolute',
        bottom: '30px',
        left: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        color: '#fff',
        padding: '18px 20px',
        borderRadius: '10px',
        fontSize: '16px',
        fontFamily: 'sans-serif',
        maxWidth: '280px',
        lineHeight: '1.6',
        zIndex: 1,
      }}>
        <strong style={{ fontSize: '18px', display: 'block', marginBottom: '10px' }}>Heatmap Key</strong>
        <div><span style={dot('blue')} /> Low Density</div>
        <div><span style={dot('lime')} /> Moderate Density</div>
        <div><span style={dot('yellow')} /> High Density</div>
        <div><span style={dot('red')} /> Critical Hotspot</div>
      </div>
    </>
  );
};

const dot = (color) => ({
  width: '18px',
  height: '18px',
  backgroundColor: color,
  borderRadius: '50%',
  display: 'inline-block',
  marginRight: '10px',
});

export default Map;
