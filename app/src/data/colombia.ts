// Departamentos y municipios de Colombia para el selector de pedidos.
// Nombres en el formato usual de las transportadoras/Effi (sin tildes raras).
// No es exhaustivo (Colombia tiene 1100+ municipios); trae las cabeceras y los
// municipios de mayor volumen por departamento. El selector SIEMPRE permite
// escribir a mano cualquier valor que no esté en la lista.

export interface DeptoCO {
  depto: string;
  ciudades: string[];
}

export const COLOMBIA: DeptoCO[] = [
  {
    depto: 'Bogotá D.C.',
    ciudades: ['Bogotá'],
  },
  {
    depto: 'Amazonas',
    ciudades: ['Leticia', 'Puerto Nariño'],
  },
  {
    depto: 'Antioquia',
    ciudades: [
      'Medellín', 'Bello', 'Itagüí', 'Envigado', 'Apartadó', 'Turbo', 'Rionegro', 'Sabaneta',
      'Caucasia', 'La Estrella', 'Copacabana', 'Caldas', 'Girardota', 'Barbosa', 'Marinilla',
      'El Carmen de Viboral', 'Guarne', 'La Ceja', 'Chigorodó', 'Necoclí', 'Carepa', 'Yarumal',
      'Santa Fe de Antioquia', 'Andes', 'Segovia', 'El Bagre', 'Puerto Berrío', 'Amagá',
      'Sonsón', 'Ciudad Bolívar', 'Támesis', 'Jericó', 'Santa Rosa de Osos', 'Yolombó',
      'Támesis', 'Urrao', 'Frontino', 'Dabeiba', 'Cañasgordas', 'San Pedro de los Milagros',
      'Don Matías', 'Entrerríos', 'La Pintada', 'Betulia', 'Concordia', 'Jardín', 'Fredonia',
    ],
  },
  {
    depto: 'Arauca',
    ciudades: ['Arauca', 'Saravena', 'Tame', 'Arauquita', 'Fortul', 'Puerto Rondón', 'Cravo Norte'],
  },
  {
    depto: 'Atlántico',
    ciudades: [
      'Barranquilla', 'Soledad', 'Malambo', 'Sabanalarga', 'Baranoa', 'Puerto Colombia',
      'Galapa', 'Sabanagrande', 'Santo Tomás', 'Palmar de Varela', 'Ponedera', 'Luruaco',
      'Repelón', 'Campo de la Cruz', 'Juan de Acosta', 'Tubará', 'Usiacurí', 'Piojó',
      'Polonuevo', 'Manatí', 'Candelaria', 'Suan', 'Santa Lucía',
    ],
  },
  {
    depto: 'Bolívar',
    ciudades: [
      'Cartagena', 'Magangué', 'Turbaco', 'El Carmen de Bolívar', 'Arjona', 'María La Baja',
      'San Juan Nepomuceno', 'Mompós', 'Santa Rosa del Sur', 'Turbaná', 'San Pablo',
      'Simití', 'Mahates', 'Villanueva', 'Clemencia', 'Santa Catalina', 'Achí', 'Morales',
      'Calamar', 'Córdoba', 'Zambrano', 'San Jacinto', 'Arenal',
    ],
  },
  {
    depto: 'Boyacá',
    ciudades: [
      'Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá', 'Paipa', 'Puerto Boyacá', 'Villa de Leyva',
      'Moniquirá', 'Nobsa', 'Samacá', 'Garagoa', 'Guateque', 'Tibasosa', 'Ramiriquí',
      'Soatá', 'Muzo', 'Miraflores', 'Santa Rosa de Viterbo', 'Aquitania', 'Tuta', 'Cómbita',
      'Ventaquemada', 'Saboyá', 'Turmequé', 'Sáchica',
    ],
  },
  {
    depto: 'Caldas',
    ciudades: [
      'Manizales', 'La Dorada', 'Chinchiná', 'Villamaría', 'Riosucio', 'Anserma', 'Supía',
      'Neira', 'Aguadas', 'Salamina', 'Pácora', 'Manzanares', 'Pensilvania', 'Viterbo',
      'Palestina', 'Belalcázar', 'Filadelfia', 'Aranzazu', 'Marmato', 'Samaná', 'Victoria',
    ],
  },
  {
    depto: 'Caquetá',
    ciudades: [
      'Florencia', 'San Vicente del Caguán', 'Puerto Rico', 'El Doncello', 'La Montañita',
      'Belén de los Andaquíes', 'El Paujil', 'Curillo', 'Morelia', 'Albania', 'Solano',
      'Cartagena del Chairá', 'Valparaíso', 'Milán',
    ],
  },
  {
    depto: 'Casanare',
    ciudades: [
      'Yopal', 'Aguazul', 'Villanueva', 'Tauramena', 'Monterrey', 'Paz de Ariporo',
      'Maní', 'Nunchía', 'Trinidad', 'Pore', 'Hato Corozal', 'Sabanalarga', 'Orocué',
    ],
  },
  {
    depto: 'Cauca',
    ciudades: [
      'Popayán', 'Santander de Quilichao', 'Puerto Tejada', 'Patía (El Bordo)', 'Piendamó',
      'Miranda', 'Corinto', 'Caloto', 'Villa Rica', 'Timbío', 'El Tambo', 'Cajibío',
      'Guapi', 'Bolívar', 'Mercaderes', 'Silvia', 'Morales', 'Caldono', 'Sotará',
    ],
  },
  {
    depto: 'Cesar',
    ciudades: [
      'Valledupar', 'Aguachica', 'Bosconia', 'La Jagua de Ibirico', 'Codazzi', 'El Copey',
      'Chimichagua', 'Curumaní', 'La Paz', 'San Diego', 'Pailitas', 'San Alberto',
      'San Martín', 'Chiriguaná', 'Pelaya', 'Astrea', 'Becerril', 'El Paso', 'Gamarra',
    ],
  },
  {
    depto: 'Chocó',
    ciudades: [
      'Quibdó', 'Istmina', 'Tadó', 'Condoto', 'Acandí', 'Bahía Solano', 'Nuquí',
      'Riosucio', 'Bojayá', 'Certegui', 'Unión Panamericana', 'El Carmen de Atrato',
    ],
  },
  {
    depto: 'Córdoba',
    ciudades: [
      'Montería', 'Cereté', 'Lorica', 'Sahagún', 'Planeta Rica', 'Montelíbano', 'Tierralta',
      'Ciénaga de Oro', 'Chinú', 'San Andrés de Sotavento', 'Puerto Libertador', 'Ayapel',
      'Pueblo Nuevo', 'San Pelayo', 'Moñitos', 'Los Córdobas', 'Tuchín', 'Valencia',
      'San Bernardo del Viento', 'Momil', 'Purísima', 'Buenavista', 'Canalete', 'La Apartada',
    ],
  },
  {
    depto: 'Cundinamarca',
    ciudades: [
      'Soacha', 'Fusagasugá', 'Facatativá', 'Zipaquirá', 'Chía', 'Mosquera', 'Madrid',
      'Girardot', 'Funza', 'Cajicá', 'Cota', 'Sibaté', 'Tocancipá', 'La Calera', 'Tenjo',
      'Fontibón', 'Villeta', 'Ubaté', 'Cáqueza', 'Pacho', 'La Mesa', 'Anapoima', 'Guaduas',
      'Sopó', 'Gachancipá', 'Tabio', 'Sesquilé', 'El Rosal', 'Bojacá', 'Subachoque',
      'Zipacón', 'Fómeque', 'Choachí', 'Silvania', 'Arbeláez', 'Pandi', 'Tocaima',
      'Agua de Dios', 'Ricaurte', 'Nilo', 'Villapinzón', 'Chocontá', 'Suesca', 'Nemocón',
      'Cogua', 'Guasca', 'Sasaima', 'Albán', 'La Vega', 'Nocaima', 'San Francisco',
    ],
  },
  {
    depto: 'Guainía',
    ciudades: ['Inírida'],
  },
  {
    depto: 'Guaviare',
    ciudades: ['San José del Guaviare', 'El Retorno', 'Calamar', 'Miraflores'],
  },
  {
    depto: 'Huila',
    ciudades: [
      'Neiva', 'Pitalito', 'Garzón', 'La Plata', 'Campoalegre', 'Gigante', 'Palermo',
      'Aipe', 'Rivera', 'San Agustín', 'Timaná', 'Isnos', 'Acevedo', 'Algeciras',
      'Tello', 'Yaguará', 'Suaza', 'Guadalupe', 'Hobo', 'Íquira', 'Tarqui',
    ],
  },
  {
    depto: 'La Guajira',
    ciudades: [
      'Riohacha', 'Maicao', 'Uribia', 'Manaure', 'San Juan del Cesar', 'Fonseca',
      'Villanueva', 'Barrancas', 'Dibulla', 'Hatonuevo', 'Albania', 'Distracción',
      'El Molino', 'La Jagua del Pilar', 'Urumita',
    ],
  },
  {
    depto: 'Magdalena',
    ciudades: [
      'Santa Marta', 'Ciénaga', 'Fundación', 'El Banco', 'Plato', 'Aracataca', 'Zona Bananera',
      'Pivijay', 'Sitionuevo', 'Ariguaní (El Difícil)', 'Salamina', 'Pueblo Viejo',
      'Guamal', 'Santa Ana', 'San Sebastián de Buenavista', 'Tenerife', 'Sabanas de San Ángel',
    ],
  },
  {
    depto: 'Meta',
    ciudades: [
      'Villavicencio', 'Acacías', 'Granada', 'Puerto López', 'Cumaral', 'San Martín',
      'Restrepo', 'Puerto Gaitán', 'Guamal', 'Cubarral', 'El Dorado', 'Castilla la Nueva',
      'San Carlos de Guaroa', 'Fuente de Oro', 'Puerto Lleras', 'Vistahermosa',
      'Barranca de Upía', 'San Juan de Arama', 'Lejanías',
    ],
  },
  {
    depto: 'Nariño',
    ciudades: [
      'Pasto', 'Tumaco', 'Ipiales', 'Túquerres', 'La Unión', 'Samaniego', 'Sandoná',
      'Barbacoas', 'Cumbal', 'Buesaco', 'La Cruz', 'Guachucal', 'Pupiales', 'El Charco',
      'Ricaurte', 'Yacuanquer', 'Consacá', 'Ospina', 'Guaitarilla', 'Aldana', 'Córdoba',
    ],
  },
  {
    depto: 'Norte de Santander',
    ciudades: [
      'Cúcuta', 'Ocaña', 'Villa del Rosario', 'Los Patios', 'Pamplona', 'Tibú', 'El Zulia',
      'Chinácota', 'Ábrego', 'Sardinata', 'Convención', 'Puerto Santander', 'San Cayetano',
      'Bochalema', 'Toledo', 'Cáchira', 'La Playa', 'El Carmen', 'Salazar', 'Villa Caro',
    ],
  },
  {
    depto: 'Putumayo',
    ciudades: [
      'Mocoa', 'Puerto Asís', 'Orito', 'Valle del Guamuez (La Hormiga)', 'Puerto Caicedo',
      'Villagarzón', 'Sibundoy', 'San Miguel', 'Puerto Guzmán', 'Colón', 'Santiago', 'San Francisco',
    ],
  },
  {
    depto: 'Quindío',
    ciudades: [
      'Armenia', 'Calarcá', 'La Tebaida', 'Montenegro', 'Quimbaya', 'Circasia', 'Filandia',
      'Salento', 'Génova', 'Córdoba', 'Buenavista', 'Pijao',
    ],
  },
  {
    depto: 'Risaralda',
    ciudades: [
      'Pereira', 'Dosquebradas', 'Santa Rosa de Cabal', 'La Virginia', 'Marsella', 'Belén de Umbría',
      'Quinchía', 'Apía', 'Santuario', 'Guática', 'Balboa', 'La Celia', 'Mistrató', 'Pueblo Rico',
    ],
  },
  {
    depto: 'San Andrés y Providencia',
    ciudades: ['San Andrés', 'Providencia'],
  },
  {
    depto: 'Santander',
    ciudades: [
      'Bucaramanga', 'Floridablanca', 'Girón', 'Piedecuesta', 'Barrancabermeja', 'San Gil',
      'Socorro', 'Barbosa', 'Málaga', 'Vélez', 'Sabana de Torres', 'Lebrija', 'Rionegro',
      'Puerto Wilches', 'Cimitarra', 'Zapatoca', 'Charalá', 'San Vicente de Chucurí',
      'Curití', 'Oiba', 'Puente Nacional', 'Mogotes', 'Landázuri', 'El Playón',
    ],
  },
  {
    depto: 'Sucre',
    ciudades: [
      'Sincelejo', 'Corozal', 'Sampués', 'San Marcos', 'San Onofre', 'Tolú', 'Coveñas',
      'Majagual', 'Sincé', 'Los Palmitos', 'Morroa', 'Ovejas', 'Galeras', 'San Benito Abad',
      'Toluviejo', 'Buenavista', 'Palmito', 'Chalán', 'Coloso', 'La Unión',
    ],
  },
  {
    depto: 'Tolima',
    ciudades: [
      'Ibagué', 'Espinal', 'Melgar', 'Honda', 'Chaparral', 'Líbano', 'Mariquita', 'Flandes',
      'Guamo', 'Purificación', 'Fresno', 'Cajamarca', 'Ortega', 'Lérida', 'Venadillo',
      'Natagaima', 'Saldaña', 'Coyaima', 'Rovira', 'Icononzo', 'Planadas', 'Ambalema',
      'Armero (Guayabal)', 'San Antonio', 'Villahermosa',
    ],
  },
  {
    depto: 'Valle del Cauca',
    ciudades: [
      'Cali', 'Palmira', 'Buenaventura', 'Tuluá', 'Cartago', 'Buga', 'Jamundí', 'Yumbo',
      'Florida', 'Pradera', 'Candelaria', 'Zarzal', 'Roldanillo', 'Sevilla', 'La Unión',
      'Caicedonia', 'Ginebra', 'Andalucía', 'Bugalagrande', 'El Cerrito', 'Guacarí',
      'Dagua', 'La Cumbre', 'Restrepo', 'Vijes', 'Yotoco', 'Toro', 'Ansermanuevo',
      'El Águila', 'Argelia', 'Alcalá', 'Ulloa', 'Versalles', 'El Dovio', 'Trujillo',
      'Riofrío', 'El Cairo', 'Obando', 'La Victoria', 'Calima (El Darién)',
    ],
  },
  {
    depto: 'Vaupés',
    ciudades: ['Mitú', 'Carurú', 'Taraira'],
  },
  {
    depto: 'Vichada',
    ciudades: ['Puerto Carreño', 'La Primavera', 'Santa Rosalía', 'Cumaribo'],
  },
];

export const DEPARTAMENTOS_CO: string[] = COLOMBIA.map((d) => d.depto);

// Busca el departamento (por nombre exacto o aproximado) y devuelve sus ciudades.
export function ciudadesDeDepto(depto: string): string[] {
  if (!depto) return [];
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const d = COLOMBIA.find((x) => norm(x.depto) === norm(depto));
  return d ? d.ciudades : [];
}
