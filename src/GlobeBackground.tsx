import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function GlobeBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 1.6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const radius = 1;
    const globeGroup = new THREE.Group();

    const sphereGeo = new THREE.SphereGeometry(radius, 32, 32);
    const wireframeMat = new THREE.MeshBasicMaterial({
      color: #7FFF00,
      wireframe: true,
      transparent: true,
      opacity: 0.09,
    });
    globeGroup.add(new THREE.Mesh(sphereGeo, wireframeMat));

    const lineMat = new THREE.LineBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.18 });

    for (let lat = -80; lat <= 80; lat += 20) {
      const phi = (lat * Math.PI) / 180;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const theta = (i / 64) * Math.PI * 2;
        points.push(new THREE.Vector3(radius * Math.cos(phi) * Math.cos(theta), radius * Math.sin(phi), radius * Math.cos(phi) * Math.sin(theta)));
      }
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
    }

    for (let lon = 0; lon < 360; lon += 20) {
      const theta = (lon * Math.PI) / 180;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const phi = (i / 64) * Math.PI - Math.PI / 2;
        points.push(new THREE.Vector3(radius * Math.cos(phi) * Math.cos(theta), radius * Math.sin(phi), radius * Math.cos(phi) * Math.sin(theta)));
      }
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
    }

    const dotGeo = new THREE.SphereGeometry(0.012, 6, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 60; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
      globeGroup.add(dot);
    }

    globeGroup.rotation.x = 0.1;
    globeGroup.rotation.z = -0.18;
    scene.add(globeGroup);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      globeGroup.rotation.y += 0.0015;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "300vw",
        height: "300vh",
        zIndex: -1,
        pointerEvents: "none",
        opacity: 0.85,
      }}
    />
  );
}