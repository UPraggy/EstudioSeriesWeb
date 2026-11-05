// Mapa ÚNICO de ícones do Estúdio (lucide-react). Toda tela usa estes nomes, nunca importa do lucide direto:
// assim a mesma ação tem sempre o mesmo desenho. Uso: <Ico.regerar className="ico-girar" aria-hidden="true" />
// Tamanho e traço vêm do CSS (.btn svg = 16 px); fora de botão, passe size={16} ou estilize.
import {
    Clapperboard, Film, Video, ReceiptText, Wallet, Menu, X, ArrowLeft, ArrowRight, Plus, Pencil, Trash2, Save, Check,
    Copy, ExternalLink, FolderOpen, Search, SlidersHorizontal, Settings2, Play, Pause, Square, SkipBack, SkipForward,
    StepBack, StepForward, RefreshCw, RefreshCcwDot, Undo2, Redo2, Scissors, Volume2, VolumeX, Mic, AudioLines, Music,
    AudioWaveform, Captions, Type, Image, Frame, Camera, UserRound, UsersRound, MapPin, Box, BookMarked, ListOrdered,
    ScrollText, Rows3, Split, Layers, CircleDollarSign, Timer, Clock, TriangleAlert, CircleAlert, CircleCheck, Info,
    LoaderCircle, FlaskConical, GripVertical, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Eye, EyeOff, Lock,
    Upload, Paperclip, SendHorizontal, Keyboard, ZoomIn, ZoomOut, Maximize2, Smartphone, Headphones, Download,
    History, Star, MessageSquareText, Feather, Library, Gauge, Magnet, Link2, Unlink2, LayoutGrid, Hash, Calendar,
} from 'lucide-react';
// acrescentados para a Mesa (editor)
import { Wind, Scan, UnfoldHorizontal, Crosshair } from 'lucide-react';
// acrescentados para a Sala do showrunner
import { LayoutDashboard, CircleDashed, ScanFace, ImagePlus } from 'lucide-react';
// acrescentados para o motor híbrido (site no GitHub Pages)
import { Laptop, PlugZap, Unplug } from 'lucide-react';
// acrescentados para a lixeira recuperável (apagar série/episódio, refazer roteiro, restaurar)
import { Ellipsis, Archive, ArchiveRestore, FilePenLine } from 'lucide-react';

export const Ico = {
    // navegação e casca
    series: Clapperboard, episodio: Film, geracaoSimples: Video, custos: ReceiptText, saldo: Wallet,
    menu: Menu, fechar: X, voltar: ArrowLeft, avancar: ArrowRight, direita: ChevronRight, esquerda: ChevronLeft,
    expandir: ChevronDown, recolher: ChevronUp, grade: LayoutGrid,
    // ações gerais
    novo: Plus, editar: Pencil, apagar: Trash2, salvar: Save, confirmar: Check, copiar: Copy, abrir: ExternalLink,
    pasta: FolderOpen, buscar: Search, filtro: SlidersHorizontal, config: Settings2, enviar: SendHorizontal,
    upload: Upload, anexo: Paperclip, baixar: Download, historico: History, favorito: Star, ver: Eye, ocultar: EyeOff,
    bloqueado: Lock, arrastar: GripVertical, ligar: Link2, desligar: Unlink2, numero: Hash, data: Calendar,
    // showrunner / história
    showrunner: Feather, pedirIA: MessageSquareText, roteiro: ScrollText, decupagem: Rows3, temporada: ListOrdered,
    biblia: BookMarked, memoria: Library, escolha: Split, personagem: UserRound, elenco: UsersRound, local: MapPin,
    objeto: Box,
    // mídia e editor
    tocar: Play, pausar: Pause, parar: Square, inicio: SkipBack, fim: SkipForward, quadroAnterior: StepBack,
    quadroSeguinte: StepForward, regerar: RefreshCw, regerarTrecho: RefreshCcwDot, desfazer: Undo2, refazer: Redo2,
    cortar: Scissors, volume: Volume2, mudo: VolumeX, voz: Mic, narracao: AudioLines, musica: Music,
    efeito: AudioWaveform, legenda: Captions, texto: Type, imagem: Image, quadroChave: Frame, camera: Camera,
    video: Video, montar: Layers, imantar: Magnet, zoomMais: ZoomIn, zoomMenos: ZoomOut, telaCheia: Maximize2,
    celular: Smartphone, ouvir: Headphones, teclado: Keyboard, velocidade: Gauge,
    // dinheiro, tempo e estados
    custo: CircleDollarSign, duracao: Timer, relogio: Clock, aviso: TriangleAlert, erro: CircleAlert, ok: CircleCheck,
    info: Info, carregando: LoaderCircle, simulado: FlaskConical,
    // Mesa: faixa de ambiente, zona segura da prévia, caber a linha do tempo na largura, ir ao cursor
    ambiente: Wind, zonaSegura: Scan, caber: UnfoldHorizontal, irCursor: Crosshair,
    // Sala: aba Visão geral, etapa ainda por fazer, rosto canônico, gerar imagem de referência
    visaoGeral: LayoutDashboard, pendente: CircleDashed, rosto: ScanFace, gerarImagem: ImagePlus,
    // motor híbrido: o Estúdio do PC, conectado, desconectado
    computador: Laptop, conectado: PlugZap, desconectado: Unplug,
    // lixeira recuperável: menu "Mais ações", lixeira, restaurar, refazer o roteiro do zero
    maisAcoes: Ellipsis, lixeira: Archive, restaurar: ArchiveRestore, refazerRoteiro: FilePenLine,
};
