import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import estilos from '../../styles.css?inline';
import { montarCafeto } from '../cafeto';

export default function CafetoPage() {
  const anfitrion = useRef<HTMLDivElement>(null);
  const navegar = useNavigate();

  useEffect(() => {
    const host = anfitrion.current!;
    const sombra = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const estilosCafeto = document.createElement('style');
    estilosCafeto.textContent = estilos;
    const app = document.createElement('div');
    app.id = 'app';
    sombra.replaceChildren(estilosCafeto, app);
    const desmontar = montarCafeto(app, () => navegar('/'));
    return () => {
      desmontar();
      sombra.replaceChildren();
    };
  }, [navegar]);

  return <div ref={anfitrion} data-cafeto-shell />;
}
