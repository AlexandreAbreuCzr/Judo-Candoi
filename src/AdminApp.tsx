import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  checkAdminPassword,
  createBlogPost,
  createPrideStudent,
  createSponsor,
  deleteBlogPost,
  deletePrideStudent,
  deleteSponsor,
  getSiteSettings,
  listBlogPosts,
  listPrideStudents,
  listSponsors,
  resolveApiAssetUrl,
  uploadAdminImage,
  updateBlogPost,
  updatePrideStudent,
  updateSponsor,
  updateSiteSettings
} from "./api/adminApi";
import type {
  BlogPostAdminResponseDTO,
  BlogPostUpsertDTO,
  GalleryItemAdminDTO,
  PrideStudentAdminResponseDTO,
  PrideStudentUpsertDTO,
  ScheduleItemAdminDTO,
  SponsorAdminResponseDTO,
  SponsorUpsertDTO,
  SiteSettingsAdminResponseDTO,
  SiteSettingsUpdateDTO,
  TestimonialAdminDTO
} from "./types/admin";
import "./styles.css";

type AuthStatus = "idle" | "checking";
type PanelTab = "site" | "gallery" | "testimonials" | "blog" | "sponsors";

const PASSWORD_STORAGE_KEY = "judo-candoi-admin-password";

const emptyBlogDraft: BlogPostUpsertDTO = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  imageUrl: "",
  active: true,
  displayOrder: 0
};

const emptyPrideDraft: PrideStudentUpsertDTO = {
  name: "",
  achievement: "",
  month: "",
  imageUrl: "",
  active: true,
  displayOrder: 0
};

const emptySponsorDraft: SponsorUpsertDTO = {
  name: "",
  description: "",
  logoUrl: "",
  websiteUrl: "",
  active: true,
  displayOrder: 0
};

const emptyScheduleDraft: ScheduleItemAdminDTO = {
  day: "",
  time: "",
  audience: ""
};

const emptyGalleryItem: GalleryItemAdminDTO = {
  title: "",
  imageUrl: "",
  category: "Atletas"
};

const emptyTestimonial: TestimonialAdminDTO = {
  quote: "",
  author: "",
  role: ""
};

function normalizeScheduleDrafts(schedules?: ScheduleItemAdminDTO[]): ScheduleItemAdminDTO[] {
  if (!Array.isArray(schedules) || schedules.length === 0) {
    return [{ ...emptyScheduleDraft }];
  }

  const normalized = schedules.map((schedule) => ({
    day: schedule?.day ?? "",
    time: schedule?.time ?? "",
    audience: schedule?.audience ?? ""
  }));

  return normalized.length > 0 ? normalized : [{ ...emptyScheduleDraft }];
}

function cleanScheduleDrafts(schedules: ScheduleItemAdminDTO[]): ScheduleItemAdminDTO[] {
  const cleaned = schedules
    .map((schedule) => ({
      day: schedule.day.trim(),
      time: schedule.time.trim(),
      audience: schedule.audience.trim()
    }))
    .filter((schedule) => schedule.day || schedule.time || schedule.audience);

  return cleaned.length > 0 ? cleaned : [{ ...emptyScheduleDraft }];
}

function normalizeGalleryDrafts(gallery?: GalleryItemAdminDTO[]): GalleryItemAdminDTO[] {
  if (!Array.isArray(gallery) || gallery.length === 0) {
    return [];
  }

  return gallery.map((item) => ({
    title: item?.title ?? "",
    imageUrl: item?.imageUrl ?? "",
    category: item?.category ?? "Atletas"
  }));
}

function cleanGalleryDrafts(gallery: GalleryItemAdminDTO[]): GalleryItemAdminDTO[] {
  return gallery
    .map((item, index) => ({
      title: item.title.trim() || `Registro de atleta ${String(index + 1).padStart(2, "0")}`,
      imageUrl: item.imageUrl.trim(),
      category: item.category.trim() || "Atletas"
    }))
    .filter((item) => item.imageUrl.length > 0);
}

function normalizeTestimonialDrafts(testimonials?: TestimonialAdminDTO[]): TestimonialAdminDTO[] {
  if (!Array.isArray(testimonials) || testimonials.length === 0) {
    return [];
  }

  return testimonials.map((item) => ({
    quote: item?.quote ?? "",
    author: item?.author ?? "",
    role: item?.role ?? ""
  }));
}

function cleanTestimonialDrafts(testimonials: TestimonialAdminDTO[]): TestimonialAdminDTO[] {
  return testimonials
    .map((item, index) => ({
      quote: item.quote.trim(),
      author: item.author.trim() || `Aluno ${index + 1}`,
      role: item.role.trim() || "Comunidade Judo Candoi"
    }))
    .filter((item) => item.quote.length > 0);
}

function toSitePayload(settings: SiteSettingsAdminResponseDTO): SiteSettingsUpdateDTO {
  const { id: _id, schedules, gallery, testimonials, ...payload } = settings;
  return {
    ...payload,
    schedules: normalizeScheduleDrafts(schedules),
    gallery: normalizeGalleryDrafts(gallery),
    testimonials: normalizeTestimonialDrafts(testimonials)
  };
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function toIntOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function AdminApp() {
  const [passwordInput, setPasswordInput] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [authMessage, setAuthMessage] = useState("");
  const [activeTab, setActiveTab] = useState<PanelTab>("site");
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [siteSettings, setSiteSettings] = useState<SiteSettingsUpdateDTO | null>(null);
  const [siteMessage, setSiteMessage] = useState("");
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [galleryMessage, setGalleryMessage] = useState("");
  const [testimonialMessage, setTestimonialMessage] = useState("");
  const [isUploadingGalleryImage, setIsUploadingGalleryImage] = useState(false);

  const [blogPosts, setBlogPosts] = useState<BlogPostAdminResponseDTO[]>([]);
  const [blogDraft, setBlogDraft] = useState<BlogPostUpsertDTO>(emptyBlogDraft);
  const [editingBlogId, setEditingBlogId] = useState<number | null>(null);
  const [blogMessage, setBlogMessage] = useState("");
  const [isSavingBlog, setIsSavingBlog] = useState(false);
  const [isUploadingBlogImage, setIsUploadingBlogImage] = useState(false);

  const [prideStudents, setPrideStudents] = useState<PrideStudentAdminResponseDTO[]>([]);
  const [prideDraft, setPrideDraft] = useState<PrideStudentUpsertDTO>(emptyPrideDraft);
  const [editingPrideId, setEditingPrideId] = useState<number | null>(null);
  const [prideMessage, setPrideMessage] = useState("");
  const [isSavingPride, setIsSavingPride] = useState(false);
  const [isUploadingPrideImage, setIsUploadingPrideImage] = useState(false);

  const [sponsors, setSponsors] = useState<SponsorAdminResponseDTO[]>([]);
  const [sponsorDraft, setSponsorDraft] = useState<SponsorUpsertDTO>(emptySponsorDraft);
  const [editingSponsorId, setEditingSponsorId] = useState<number | null>(null);
  const [sponsorMessage, setSponsorMessage] = useState("");
  const [isSavingSponsor, setIsSavingSponsor] = useState(false);
  const [isUploadingSponsorImage, setIsUploadingSponsorImage] = useState(false);

  useEffect(() => {
    const storedPassword = window.localStorage.getItem(PASSWORD_STORAGE_KEY);

    if (!storedPassword) {
      return;
    }

    setPasswordInput(storedPassword);
    void authenticate(storedPassword, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedBlogs = useMemo(
    () => [...blogPosts].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
    [blogPosts]
  );

  const sortedPrideStudents = useMemo(
    () => [...prideStudents].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
    [prideStudents]
  );

  const sortedSponsors = useMemo(
    () => [...sponsors].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
    [sponsors]
  );

  async function authenticate(password: string, fromStorage = false): Promise<void> {
    if (!password.trim()) {
      setAuthMessage("Informe a senha do painel.");
      return;
    }

    try {
      setAuthStatus("checking");
      setAuthMessage("Validando senha...");
      await checkAdminPassword(password);
      setAdminPassword(password);
      setIsAuthenticated(true);
      setAuthMessage("");
      window.localStorage.setItem(PASSWORD_STORAGE_KEY, password);
      await loadPanelData(password);
    } catch (error) {
      if (fromStorage) {
        window.localStorage.removeItem(PASSWORD_STORAGE_KEY);
      }

      setIsAuthenticated(false);
      setAuthMessage(
        error instanceof Error ? error.message : "Nao foi possivel autenticar no painel."
      );
    } finally {
      setAuthStatus("idle");
    }
  }

  async function loadPanelData(password: string): Promise<void> {
    try {
      setIsLoadingData(true);
      const [settings, posts, students, sponsorItems] = await Promise.all([
        getSiteSettings(password),
        listBlogPosts(password),
        listPrideStudents(password),
        listSponsors(password)
      ]);

      setSiteSettings(toSitePayload(settings));
      setBlogPosts(posts);
      setPrideStudents(students);
      setSponsors(sponsorItems);
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Erro ao carregar dados do painel."
      );
    } finally {
      setIsLoadingData(false);
    }
  }

  async function refreshBlogPosts(): Promise<void> {
    try {
      const posts = await listBlogPosts(adminPassword);
      setBlogPosts(posts);
    } catch (error) {
      setBlogMessage(
        error instanceof Error ? error.message : "Erro ao atualizar lista de posts do blog."
      );
    }
  }

  async function refreshPrideStudents(): Promise<void> {
    try {
      const students = await listPrideStudents(adminPassword);
      setPrideStudents(students);
    } catch (error) {
      setPrideMessage(
        error instanceof Error ? error.message : "Erro ao atualizar lista de alunos destaque."
      );
    }
  }

  async function refreshSponsors(): Promise<void> {
    try {
      const items = await listSponsors(adminPassword);
      setSponsors(items);
    } catch (error) {
      setSponsorMessage(
        error instanceof Error ? error.message : "Erro ao atualizar lista de patrocinadores."
      );
    }
  }

  async function handleBlogImageUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setIsUploadingBlogImage(true);
      setBlogMessage("Enviando imagem do blog...");
      const uploaded = await uploadAdminImage(adminPassword, file, "blog");
      setBlogDraft((previous) => ({ ...previous, imageUrl: uploaded.url }));
      setBlogMessage("Imagem do blog enviada com sucesso.");
    } catch (error) {
      setBlogMessage(
        error instanceof Error ? error.message : "Nao foi possivel enviar a imagem do blog."
      );
    } finally {
      setIsUploadingBlogImage(false);
    }
  }

  async function handlePrideImageUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setIsUploadingPrideImage(true);
      setPrideMessage("Enviando imagem do aluno destaque...");
      const uploaded = await uploadAdminImage(adminPassword, file, "site");
      setPrideDraft((previous) => ({ ...previous, imageUrl: uploaded.url }));
      setPrideMessage("Imagem do aluno destaque enviada com sucesso.");
    } catch (error) {
      setPrideMessage(
        error instanceof Error ? error.message : "Nao foi possivel enviar a imagem do aluno destaque."
      );
    } finally {
      setIsUploadingPrideImage(false);
    }
  }

  async function handleSponsorImageUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setIsUploadingSponsorImage(true);
      setSponsorMessage("Enviando imagem do patrocinador...");
      const uploaded = await uploadAdminImage(adminPassword, file, "sponsors");
      setSponsorDraft((previous) => ({ ...previous, logoUrl: uploaded.url }));
      setSponsorMessage("Imagem do patrocinador enviada com sucesso.");
    } catch (error) {
      setSponsorMessage(
        error instanceof Error ? error.message : "Nao foi possivel enviar a imagem do patrocinador."
      );
    } finally {
      setIsUploadingSponsorImage(false);
    }
  }

  function handleLogout(): void {
    window.localStorage.removeItem(PASSWORD_STORAGE_KEY);
    setIsAuthenticated(false);
    setAdminPassword("");
    setPasswordInput("");
    setAuthMessage("");
    setSiteMessage("");
    setGalleryMessage("");
    setTestimonialMessage("");
    setBlogMessage("");
    setPrideMessage("");
    setSponsorMessage("");
    setSiteSettings(null);
    setBlogPosts([]);
    setPrideStudents([]);
    setSponsors([]);
    setBlogDraft(emptyBlogDraft);
    setPrideDraft(emptyPrideDraft);
    setSponsorDraft(emptySponsorDraft);
    setEditingBlogId(null);
    setEditingPrideId(null);
    setEditingSponsorId(null);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await authenticate(passwordInput);
  }

  function updateScheduleField(
    index: number,
    field: keyof ScheduleItemAdminDTO,
    value: string
  ): void {
    setSiteSettings((previous) => {
      if (!previous) {
        return previous;
      }

      const schedules = normalizeScheduleDrafts(previous.schedules).map((schedule, itemIndex) =>
        itemIndex === index ? { ...schedule, [field]: value } : schedule
      );

      return { ...previous, schedules };
    });
  }

  function addScheduleItem(): void {
    setSiteSettings((previous) =>
      previous
        ? { ...previous, schedules: [...normalizeScheduleDrafts(previous.schedules), { ...emptyScheduleDraft }] }
        : previous
    );
  }

  function removeScheduleItem(index: number): void {
    setSiteSettings((previous) => {
      if (!previous) {
        return previous;
      }

      const schedules = normalizeScheduleDrafts(previous.schedules).filter(
        (_schedule, itemIndex) => itemIndex !== index
      );

      return {
        ...previous,
        schedules: schedules.length > 0 ? schedules : [{ ...emptyScheduleDraft }]
      };
    });
  }

  function updateGalleryField(index: number, field: keyof GalleryItemAdminDTO, value: string): void {
    setSiteSettings((previous) => {
      if (!previous) {
        return previous;
      }

      const gallery = normalizeGalleryDrafts(previous.gallery).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      );

      return { ...previous, gallery };
    });
  }

  function addGalleryItem(): void {
    setSiteSettings((previous) =>
      previous
        ? { ...previous, gallery: [...normalizeGalleryDrafts(previous.gallery), { ...emptyGalleryItem }] }
        : previous
    );
  }

  function removeGalleryItem(index: number): void {
    setSiteSettings((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        gallery: normalizeGalleryDrafts(previous.gallery).filter((_item, itemIndex) => itemIndex !== index)
      };
    });
  }

  function moveGalleryItem(index: number, direction: "up" | "down"): void {
    setSiteSettings((previous) => {
      if (!previous) {
        return previous;
      }

      const gallery = [...normalizeGalleryDrafts(previous.gallery)];
      const nextIndex = direction === "up" ? index - 1 : index + 1;

      if (nextIndex < 0 || nextIndex >= gallery.length) {
        return previous;
      }

      [gallery[index], gallery[nextIndex]] = [gallery[nextIndex], gallery[index]];
      return { ...previous, gallery };
    });
  }

  function updateTestimonialField(
    index: number,
    field: keyof TestimonialAdminDTO,
    value: string
  ): void {
    setSiteSettings((previous) => {
      if (!previous) {
        return previous;
      }

      const testimonials = normalizeTestimonialDrafts(previous.testimonials).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      );

      return { ...previous, testimonials };
    });
  }

  function addTestimonialItem(): void {
    setSiteSettings((previous) =>
      previous
        ? {
            ...previous,
            testimonials: [
              ...normalizeTestimonialDrafts(previous.testimonials),
              { ...emptyTestimonial }
            ]
          }
        : previous
    );
  }

  function removeTestimonialItem(index: number): void {
    setSiteSettings((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        testimonials: normalizeTestimonialDrafts(previous.testimonials).filter(
          (_item, itemIndex) => itemIndex !== index
        )
      };
    });
  }

  function moveTestimonialItem(index: number, direction: "up" | "down"): void {
    setSiteSettings((previous) => {
      if (!previous) {
        return previous;
      }

      const testimonials = [...normalizeTestimonialDrafts(previous.testimonials)];
      const nextIndex = direction === "up" ? index - 1 : index + 1;

      if (nextIndex < 0 || nextIndex >= testimonials.length) {
        return previous;
      }

      [testimonials[index], testimonials[nextIndex]] = [testimonials[nextIndex], testimonials[index]];
      return { ...previous, testimonials };
    });
  }

  async function persistSiteSettings(
    setMessage: (message: string) => void,
    successMessage: string,
    errorMessage: string
  ): Promise<void> {

    if (!siteSettings) {
      return;
    }

    try {
      setIsSavingSite(true);
      setMessage("Salvando alteracoes...");
      const updated = await updateSiteSettings(adminPassword, {
        ...siteSettings,
        schedules: cleanScheduleDrafts(siteSettings.schedules),
        gallery: cleanGalleryDrafts(siteSettings.gallery),
        testimonials: cleanTestimonialDrafts(siteSettings.testimonials)
      });
      setSiteSettings(toSitePayload(updated));
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : errorMessage);
    } finally {
      setIsSavingSite(false);
    }
  }

  async function handleGalleryImageUpload(
    index: number,
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setIsUploadingGalleryImage(true);
      setGalleryMessage("Enviando imagem da galeria...");
      const uploaded = await uploadAdminImage(adminPassword, file, "gallery");
      updateGalleryField(index, "imageUrl", uploaded.url);
      setGalleryMessage("Imagem da galeria enviada com sucesso.");
    } catch (error) {
      setGalleryMessage(
        error instanceof Error ? error.message : "Nao foi possivel enviar a imagem da galeria."
      );
    } finally {
      setIsUploadingGalleryImage(false);
    }
  }

  async function handleSaveSiteSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await persistSiteSettings(
      setSiteMessage,
      "Informacoes do site atualizadas com sucesso.",
      "Nao foi possivel salvar as informacoes do site."
    );
  }

  async function handleSaveGallerySettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await persistSiteSettings(
      setGalleryMessage,
      "Galeria dos atletas atualizada com sucesso.",
      "Nao foi possivel salvar a galeria dos atletas."
    );
  }

  async function handleSaveTestimonialSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await persistSiteSettings(
      setTestimonialMessage,
      "Depoimentos atualizados com sucesso.",
      "Nao foi possivel salvar os depoimentos."
    );
  }

  async function handleSaveBlogPost(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      setIsSavingBlog(true);

      if (editingBlogId == null) {
        await createBlogPost(adminPassword, blogDraft);
        setBlogMessage("Post criado com sucesso.");
      } else {
        await updateBlogPost(adminPassword, editingBlogId, blogDraft);
        setBlogMessage("Post atualizado com sucesso.");
      }

      setBlogDraft(emptyBlogDraft);
      setEditingBlogId(null);
      await refreshBlogPosts();
    } catch (error) {
      setBlogMessage(
        error instanceof Error ? error.message : "Nao foi possivel salvar o post do blog."
      );
    } finally {
      setIsSavingBlog(false);
    }
  }

  async function handleDeleteBlogPost(id: number): Promise<void> {
    try {
      await deleteBlogPost(adminPassword, id);
      if (editingBlogId === id) {
        setEditingBlogId(null);
        setBlogDraft(emptyBlogDraft);
      }
      setBlogMessage("Post removido.");
      await refreshBlogPosts();
    } catch (error) {
      setBlogMessage(
        error instanceof Error ? error.message : "Nao foi possivel excluir o post do blog."
      );
    }
  }

  async function handleSavePrideStudent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      setIsSavingPride(true);

      if (editingPrideId == null) {
        await createPrideStudent(adminPassword, prideDraft);
        setPrideMessage("Aluno destaque criado com sucesso.");
      } else {
        await updatePrideStudent(adminPassword, editingPrideId, prideDraft);
        setPrideMessage("Aluno destaque atualizado com sucesso.");
      }

      setPrideDraft(emptyPrideDraft);
      setEditingPrideId(null);
      await refreshPrideStudents();
    } catch (error) {
      setPrideMessage(
        error instanceof Error ? error.message : "Nao foi possivel salvar o aluno destaque."
      );
    } finally {
      setIsSavingPride(false);
    }
  }

  async function handleDeletePrideStudent(id: number): Promise<void> {
    try {
      await deletePrideStudent(adminPassword, id);
      if (editingPrideId === id) {
        setEditingPrideId(null);
        setPrideDraft(emptyPrideDraft);
      }
      setPrideMessage("Aluno destaque removido.");
      await refreshPrideStudents();
    } catch (error) {
      setPrideMessage(
        error instanceof Error ? error.message : "Nao foi possivel excluir o aluno destaque."
      );
    }
  }

  async function handleSaveSponsor(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      setIsSavingSponsor(true);

      if (editingSponsorId == null) {
        await createSponsor(adminPassword, sponsorDraft);
        setSponsorMessage("Patrocinador criado com sucesso.");
      } else {
        await updateSponsor(adminPassword, editingSponsorId, sponsorDraft);
        setSponsorMessage("Patrocinador atualizado com sucesso.");
      }

      setSponsorDraft(emptySponsorDraft);
      setEditingSponsorId(null);
      await refreshSponsors();
    } catch (error) {
      setSponsorMessage(
        error instanceof Error ? error.message : "Nao foi possivel salvar o patrocinador."
      );
    } finally {
      setIsSavingSponsor(false);
    }
  }

  async function handleDeleteSponsor(id: number): Promise<void> {
    try {
      await deleteSponsor(adminPassword, id);
      if (editingSponsorId === id) {
        setEditingSponsorId(null);
        setSponsorDraft(emptySponsorDraft);
      }
      setSponsorMessage("Patrocinador removido.");
      await refreshSponsors();
    } catch (error) {
      setSponsorMessage(
        error instanceof Error ? error.message : "Nao foi possivel excluir o patrocinador."
      );
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="admin-shell">
        <div className="admin-auth-card">
          <h1>Painel Admin | Judo Candoi</h1>
          <p>Use a senha compartilhada para editar o site e o blog.</p>

          <form onSubmit={handleAuthSubmit} className="admin-auth-form">
            <label>
              Senha do painel
              <input
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder="Digite a senha"
                required
              />
            </label>

            <button className="button button-primary" type="submit" disabled={authStatus === "checking"}>
              {authStatus === "checking" ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>

          {authMessage ? <p className="admin-message error">{authMessage}</p> : null}
          <a className="admin-back-link" href="/">
            Voltar ao site publico
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <strong>Judo Candoi | Painel Admin</strong>
          <p>Edite site, galeria, depoimentos, blog e espacos de patrocinio.</p>
        </div>

        <div className="admin-top-actions">
          <a className="button button-outline" href="/">
            Ver site publico
          </a>
          <button className="button button-primary" type="button" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>

      <main className="admin-main">
        <nav className="admin-tabs">
          <button
            type="button"
            className={activeTab === "site" ? "active" : ""}
            onClick={() => setActiveTab("site")}
          >
            Informacoes do Site
          </button>
          <button
            type="button"
            className={activeTab === "gallery" ? "active" : ""}
            onClick={() => setActiveTab("gallery")}
          >
            Galeria
          </button>
          <button
            type="button"
            className={activeTab === "testimonials" ? "active" : ""}
            onClick={() => setActiveTab("testimonials")}
          >
            Depoimentos
          </button>
          <button
            type="button"
            className={activeTab === "blog" ? "active" : ""}
            onClick={() => setActiveTab("blog")}
          >
            Blog
          </button>
          <button
            type="button"
            className={activeTab === "sponsors" ? "active" : ""}
            onClick={() => setActiveTab("sponsors")}
          >
            Patrocinios
          </button>
        </nav>

        {isLoadingData ? <p className="admin-message">Carregando dados do painel...</p> : null}

        {!isLoadingData && activeTab === "site" && siteSettings ? (
          <section className="admin-panel">
            <h2>Informacoes institucionais</h2>
            <form className="admin-form-grid" onSubmit={handleSaveSiteSettings}>
              <label>
                Nome da marca
                <input
                  type="text"
                  value={siteSettings.brandName}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, brandName: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Titulo principal
                <input
                  type="text"
                  value={siteSettings.heroTitle}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, heroTitle: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label className="full">
                Subtitulo principal
                <textarea
                  rows={2}
                  value={siteSettings.heroSubtitle}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, heroSubtitle: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label className="full">
                Frase de impacto
                <textarea
                  rows={2}
                  value={siteSettings.impactPhrase}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, impactPhrase: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Botao principal (texto)
                <input
                  type="text"
                  value={siteSettings.callToActionPrimaryLabel}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous
                        ? { ...previous, callToActionPrimaryLabel: event.target.value }
                        : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Botao principal (link)
                <input
                  type="text"
                  value={siteSettings.callToActionPrimaryUrl}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, callToActionPrimaryUrl: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Botao secundario (texto)
                <input
                  type="text"
                  value={siteSettings.callToActionSecondaryLabel}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous
                        ? { ...previous, callToActionSecondaryLabel: event.target.value }
                        : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Titulo secao sobre
                <input
                  type="text"
                  value={siteSettings.aboutTitle}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, aboutTitle: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label className="full">
                Historia
                <textarea
                  rows={4}
                  value={siteSettings.aboutStory}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, aboutStory: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label className="full">
                Destaque do sobre
                <textarea
                  rows={2}
                  value={siteSettings.aboutHighlight}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, aboutHighlight: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Titulo aula experimental
                <input
                  type="text"
                  value={siteSettings.trialTitle}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, trialTitle: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label className="full">
                Descricao aula experimental
                <textarea
                  rows={2}
                  value={siteSettings.trialDescription}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, trialDescription: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label className="full">
                Chamada final
                <textarea
                  rows={2}
                  value={siteSettings.finalCallToAction}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, finalCallToAction: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Contador alunos
                <input
                  type="text"
                  value={siteSettings.counterStudents}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, counterStudents: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Contador medalhas
                <input
                  type="text"
                  value={siteSettings.counterMedals}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, counterMedals: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Contador anos
                <input
                  type="text"
                  value={siteSettings.counterYears}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, counterYears: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Competicoes
                <input
                  type="number"
                  min={0}
                  value={siteSettings.medalCompetitions}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous
                        ? { ...previous, medalCompetitions: toIntOrZero(event.target.value) }
                        : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Lutas
                <input
                  type="number"
                  min={0}
                  value={siteSettings.medalFights}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, medalFights: toIntOrZero(event.target.value) } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Medalhas ouro
                <input
                  type="number"
                  min={0}
                  value={siteSettings.medalGold}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, medalGold: toIntOrZero(event.target.value) } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Medalhas prata
                <input
                  type="number"
                  min={0}
                  value={siteSettings.medalSilver}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, medalSilver: toIntOrZero(event.target.value) } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Medalhas bronze
                <input
                  type="number"
                  min={0}
                  value={siteSettings.medalBronze}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, medalBronze: toIntOrZero(event.target.value) } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                WhatsApp (somente numeros)
                <input
                  type="text"
                  value={siteSettings.whatsappNumber}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, whatsappNumber: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label>
                Instagram
                <input
                  type="text"
                  value={siteSettings.instagramHandle}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, instagramHandle: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label className="full">
                Endereco
                <input
                  type="text"
                  value={siteSettings.academyAddress}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, academyAddress: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <label className="full">
                URL do mapa embed
                <input
                  type="text"
                  value={siteSettings.googleMapsEmbed}
                  onChange={(event) =>
                    setSiteSettings((previous) =>
                      previous ? { ...previous, googleMapsEmbed: event.target.value } : previous
                    )
                  }
                  required
                />
              </label>

              <div className="admin-schedules-editor full">
                <div>
                  <h3>Horarios de treino</h3>
                  <p className="admin-helper-text">
                    Atualize os dias, horarios e turmas exibidos na tabela publica do site.
                  </p>
                </div>

                {normalizeScheduleDrafts(siteSettings.schedules).map((schedule, index) => (
                  <div className="admin-schedule-row" key={index}>
                    <label>
                      Dia
                      <input
                        type="text"
                        value={schedule.day}
                        onChange={(event) => updateScheduleField(index, "day", event.target.value)}
                        required
                      />
                    </label>

                    <label>
                      Horario
                      <input
                        type="text"
                        value={schedule.time}
                        onChange={(event) => updateScheduleField(index, "time", event.target.value)}
                        required
                      />
                    </label>

                    <label>
                      Turma
                      <input
                        type="text"
                        value={schedule.audience}
                        onChange={(event) => updateScheduleField(index, "audience", event.target.value)}
                        required
                      />
                    </label>

                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => removeScheduleItem(index)}
                    >
                      Remover
                    </button>
                  </div>
                ))}

                <button className="button button-outline" type="button" onClick={addScheduleItem}>
                  Adicionar horario
                </button>
              </div>

              <button className="button button-primary full" type="submit" disabled={isSavingSite}>
                {isSavingSite ? "Salvando..." : "Salvar informacoes do site"}
              </button>
            </form>

            {siteMessage ? <p className="admin-message">{siteMessage}</p> : null}

            <div className="admin-subsection">
              <h3>Orgulho Candoi (aluno do mes)</h3>

              <form className="admin-form-grid" onSubmit={handleSavePrideStudent}>
                <label>
                  Nome
                  <input
                    type="text"
                    value={prideDraft.name}
                    onChange={(event) =>
                      setPrideDraft((previous) => ({ ...previous, name: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  Mes
                  <input
                    type="text"
                    value={prideDraft.month}
                    onChange={(event) =>
                      setPrideDraft((previous) => ({ ...previous, month: event.target.value }))
                    }
                    required
                  />
                </label>

                <label className="full">
                  Conquista
                  <textarea
                    rows={2}
                    value={prideDraft.achievement}
                    onChange={(event) =>
                      setPrideDraft((previous) => ({ ...previous, achievement: event.target.value }))
                    }
                    required
                  />
                </label>

                <label className="full">
                  Imagem do aluno destaque (opcional)
                  <input
                    type="text"
                    value={prideDraft.imageUrl ?? ""}
                    onChange={(event) =>
                      setPrideDraft((previous) => ({ ...previous, imageUrl: event.target.value }))
                    }
                    placeholder="/uploads/site/... ou URL completa"
                  />
                  <div className="admin-inline-actions">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => void handlePrideImageUpload(event)}
                      disabled={isUploadingPrideImage}
                    />
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() =>
                        setPrideDraft((previous) => ({
                          ...previous,
                          imageUrl: ""
                        }))
                      }
                    >
                      Remover imagem
                    </button>
                  </div>
                  {prideDraft.imageUrl ? (
                    <img
                      className="admin-image-preview"
                      src={resolveApiAssetUrl(prideDraft.imageUrl)}
                      alt="Preview aluno destaque"
                      loading="lazy"
                    />
                  ) : null}
                </label>

                <label>
                  Ordem de exibicao
                  <input
                    type="number"
                    value={prideDraft.displayOrder}
                    onChange={(event) =>
                      setPrideDraft((previous) => ({
                        ...previous,
                        displayOrder: Number.parseInt(event.target.value, 10) || 0
                      }))
                    }
                  />
                </label>

                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={prideDraft.active}
                    onChange={(event) =>
                      setPrideDraft((previous) => ({ ...previous, active: event.target.checked }))
                    }
                  />
                  Ativo no site
                </label>

                <div className="admin-inline-actions full">
                  <button className="button button-primary" type="submit" disabled={isSavingPride}>
                    {isSavingPride
                      ? "Salvando..."
                      : editingPrideId == null
                        ? "Criar aluno destaque"
                        : "Atualizar aluno destaque"}
                  </button>
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => {
                      setEditingPrideId(null);
                      setPrideDraft(emptyPrideDraft);
                    }}
                  >
                    Limpar
                  </button>
                </div>
              </form>

              {prideMessage ? <p className="admin-message">{prideMessage}</p> : null}

              <div className="admin-list">
                {sortedPrideStudents.map((student) => (
                  <article key={student.id} className="admin-list-item">
                    <div>
                      <strong>{student.name}</strong>
                      <p>{student.achievement}</p>
                      <span>
                        {student.month} | ordem {student.displayOrder} |{" "}
                        {student.active ? "ativo" : "inativo"}
                      </span>
                    </div>
                    <div className="admin-inline-actions">
                      <button
                        className="button button-outline"
                        type="button"
                        onClick={() => {
                          setEditingPrideId(student.id);
                          setPrideDraft({
                            name: student.name,
                            achievement: student.achievement,
                            month: student.month,
                            imageUrl: student.imageUrl ?? "",
                            active: student.active,
                            displayOrder: student.displayOrder
                          });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => void handleDeletePrideStudent(student.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!isLoadingData && activeTab === "gallery" && siteSettings ? (
          <section className="admin-panel">
            <h2>Galeria dos atletas</h2>
            <p className="admin-helper-text">
              Adicione, remova e reorganize as imagens da galeria publica. Linhas sem imagem nao
              sao salvas.
            </p>

            <form className="admin-array-form" onSubmit={handleSaveGallerySettings}>
              <div className="admin-array-list">
                {normalizeGalleryDrafts(siteSettings.gallery).map((item, index) => (
                  <article key={`${item.imageUrl || "gallery"}-${index}`} className="admin-array-card">
                    <div className="admin-array-card-head">
                      <strong>Imagem {index + 1}</strong>
                      <div className="admin-inline-actions">
                        <button
                          className="button button-outline"
                          type="button"
                          onClick={() => moveGalleryItem(index, "up")}
                          disabled={index === 0}
                        >
                          Subir
                        </button>
                        <button
                          className="button button-outline"
                          type="button"
                          onClick={() => moveGalleryItem(index, "down")}
                          disabled={index === normalizeGalleryDrafts(siteSettings.gallery).length - 1}
                        >
                          Descer
                        </button>
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => removeGalleryItem(index)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    <div className="admin-form-grid">
                      <label>
                        Titulo da imagem
                        <input
                          type="text"
                          value={item.title}
                          onChange={(event) => updateGalleryField(index, "title", event.target.value)}
                          placeholder="Ex: Campeonato regional"
                        />
                      </label>

                      <label>
                        Categoria
                        <input
                          type="text"
                          value={item.category}
                          onChange={(event) => updateGalleryField(index, "category", event.target.value)}
                          placeholder="Treinos, Campeonatos, Podio..."
                        />
                      </label>

                      <label className="full">
                        URL da imagem
                        <input
                          type="text"
                          value={item.imageUrl}
                          onChange={(event) => updateGalleryField(index, "imageUrl", event.target.value)}
                          placeholder="/uploads/gallery/... ou /images/athletes/..."
                        />
                        <div className="admin-inline-actions">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => void handleGalleryImageUpload(index, event)}
                            disabled={isUploadingGalleryImage}
                          />
                          <button
                            className="button button-outline"
                            type="button"
                            onClick={() => updateGalleryField(index, "imageUrl", "")}
                          >
                            Limpar imagem
                          </button>
                        </div>
                        {item.imageUrl ? (
                          <img
                            className="admin-image-preview"
                            src={resolveApiAssetUrl(item.imageUrl)}
                            alt={`Preview galeria ${index + 1}`}
                            loading="lazy"
                          />
                        ) : null}
                      </label>
                    </div>
                  </article>
                ))}
              </div>

              {normalizeGalleryDrafts(siteSettings.gallery).length === 0 ? (
                <p className="admin-helper-text">
                  Nenhuma imagem cadastrada ainda. Clique em adicionar para montar a galeria.
                </p>
              ) : null}

              <div className="admin-inline-actions">
                <button className="button button-outline" type="button" onClick={addGalleryItem}>
                  Adicionar imagem
                </button>
                <button className="button button-primary" type="submit" disabled={isSavingSite}>
                  {isSavingSite ? "Salvando..." : "Salvar galeria"}
                </button>
              </div>
            </form>

            {galleryMessage ? <p className="admin-message">{galleryMessage}</p> : null}
          </section>
        ) : null}

        {!isLoadingData && activeTab === "testimonials" && siteSettings ? (
          <section className="admin-panel">
            <h2>Depoimentos de transformacao</h2>
            <p className="admin-helper-text">
              Gerencie os depoimentos exibidos na secao de historias reais de transformacao.
              Linhas sem texto nao sao salvas.
            </p>

            <form className="admin-array-form" onSubmit={handleSaveTestimonialSettings}>
              <div className="admin-array-list">
                {normalizeTestimonialDrafts(siteSettings.testimonials).map((item, index) => (
                  <article key={`${item.author || "testimonial"}-${index}`} className="admin-array-card">
                    <div className="admin-array-card-head">
                      <strong>Depoimento {index + 1}</strong>
                      <div className="admin-inline-actions">
                        <button
                          className="button button-outline"
                          type="button"
                          onClick={() => moveTestimonialItem(index, "up")}
                          disabled={index === 0}
                        >
                          Subir
                        </button>
                        <button
                          className="button button-outline"
                          type="button"
                          onClick={() => moveTestimonialItem(index, "down")}
                          disabled={index === normalizeTestimonialDrafts(siteSettings.testimonials).length - 1}
                        >
                          Descer
                        </button>
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => removeTestimonialItem(index)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    <div className="admin-form-grid">
                      <label className="full">
                        Depoimento
                        <textarea
                          rows={4}
                          value={item.quote}
                          onChange={(event) =>
                            updateTestimonialField(index, "quote", event.target.value)
                          }
                          placeholder="Texto que vai aparecer entre aspas no site"
                        />
                      </label>

                      <label>
                        Autor
                        <input
                          type="text"
                          value={item.author}
                          onChange={(event) =>
                            updateTestimonialField(index, "author", event.target.value)
                          }
                          placeholder="Ex: Maria S."
                        />
                      </label>

                      <label>
                        Relacao / cargo
                        <input
                          type="text"
                          value={item.role}
                          onChange={(event) =>
                            updateTestimonialField(index, "role", event.target.value)
                          }
                          placeholder="Ex: Mae de atleta"
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>

              {normalizeTestimonialDrafts(siteSettings.testimonials).length === 0 ? (
                <p className="admin-helper-text">
                  Nenhum depoimento cadastrado ainda. Clique em adicionar para criar a secao.
                </p>
              ) : null}

              <div className="admin-inline-actions">
                <button className="button button-outline" type="button" onClick={addTestimonialItem}>
                  Adicionar depoimento
                </button>
                <button className="button button-primary" type="submit" disabled={isSavingSite}>
                  {isSavingSite ? "Salvando..." : "Salvar depoimentos"}
                </button>
              </div>
            </form>

            {testimonialMessage ? <p className="admin-message">{testimonialMessage}</p> : null}
          </section>
        ) : null}

        {!isLoadingData && activeTab === "blog" ? (
          <section className="admin-panel">
            <h2>Gerenciar blog</h2>

            <form className="admin-form-grid" onSubmit={handleSaveBlogPost}>
              <label>
                Titulo
                <input
                  type="text"
                  value={blogDraft.title}
                  onChange={(event) =>
                    setBlogDraft((previous) => ({ ...previous, title: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Slug
                <div className="admin-slug-field">
                  <input
                    type="text"
                    value={blogDraft.slug}
                    onChange={(event) =>
                      setBlogDraft((previous) => ({ ...previous, slug: event.target.value }))
                    }
                    required
                  />
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() =>
                      setBlogDraft((previous) => ({ ...previous, slug: toSlug(previous.title) }))
                    }
                  >
                    Gerar
                  </button>
                </div>
              </label>

              <label className="full">
                Resumo
                <textarea
                  rows={3}
                  value={blogDraft.excerpt}
                  onChange={(event) =>
                    setBlogDraft((previous) => ({ ...previous, excerpt: event.target.value }))
                  }
                  required
                />
              </label>

              <label className="full">
                Conteudo completo
                <textarea
                  rows={10}
                  value={blogDraft.content}
                  onChange={(event) =>
                    setBlogDraft((previous) => ({ ...previous, content: event.target.value }))
                  }
                  required
                />
              </label>

              <label className="full">
                Imagem de capa (opcional)
                <input
                  type="text"
                  value={blogDraft.imageUrl ?? ""}
                  onChange={(event) =>
                    setBlogDraft((previous) => ({ ...previous, imageUrl: event.target.value }))
                  }
                  placeholder="/uploads/blog/... ou URL completa"
                />
                <div className="admin-inline-actions">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleBlogImageUpload(event)}
                    disabled={isUploadingBlogImage}
                  />
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => setBlogDraft((previous) => ({ ...previous, imageUrl: "" }))}
                  >
                    Remover imagem
                  </button>
                </div>
                {blogDraft.imageUrl ? (
                  <img
                    className="admin-image-preview"
                    src={resolveApiAssetUrl(blogDraft.imageUrl)}
                    alt="Preview capa do blog"
                    loading="lazy"
                  />
                ) : null}
              </label>

              <label>
                Ordem de exibicao
                <input
                  type="number"
                  value={blogDraft.displayOrder}
                  onChange={(event) =>
                    setBlogDraft((previous) => ({
                      ...previous,
                      displayOrder: Number.parseInt(event.target.value, 10) || 0
                    }))
                  }
                />
              </label>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={blogDraft.active}
                  onChange={(event) =>
                    setBlogDraft((previous) => ({ ...previous, active: event.target.checked }))
                  }
                />
                Ativo no site
              </label>

              <div className="admin-inline-actions full">
                <button className="button button-primary" type="submit" disabled={isSavingBlog}>
                  {isSavingBlog
                    ? "Salvando..."
                    : editingBlogId == null
                      ? "Criar post"
                      : "Atualizar post"}
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => {
                    setEditingBlogId(null);
                    setBlogDraft(emptyBlogDraft);
                  }}
                >
                  Limpar
                </button>
              </div>
            </form>

            {blogMessage ? <p className="admin-message">{blogMessage}</p> : null}

            <div className="admin-list">
              {sortedBlogs.map((post) => (
                <article key={post.id} className="admin-list-item">
                  <div>
                    <strong>{post.title}</strong>
                    <p>{post.excerpt}</p>
                    <span>
                      /{post.slug} | ordem {post.displayOrder} | {post.active ? "ativo" : "inativo"}
                    </span>
                  </div>
                  <div className="admin-inline-actions">
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => {
                        setEditingBlogId(post.id);
                        setBlogDraft({
                          title: post.title,
                          slug: post.slug,
                          excerpt: post.excerpt,
                          content: post.content,
                          imageUrl: post.imageUrl ?? "",
                          active: post.active,
                          displayOrder: post.displayOrder
                        });
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void handleDeleteBlogPost(post.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!isLoadingData && activeTab === "sponsors" ? (
          <section className="admin-panel">
            <h2>Gerenciar patrocinadores</h2>

            <form className="admin-form-grid" onSubmit={handleSaveSponsor}>
              <label>
                Nome do patrocinador
                <input
                  type="text"
                  value={sponsorDraft.name}
                  onChange={(event) =>
                    setSponsorDraft((previous) => ({ ...previous, name: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                URL da logo/imagem
                <input
                  type="text"
                  value={sponsorDraft.logoUrl}
                  onChange={(event) =>
                    setSponsorDraft((previous) => ({ ...previous, logoUrl: event.target.value }))
                  }
                  required
                />
              </label>

              <label className="full">
                Importar imagem do patrocinador
                <div className="admin-inline-actions">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleSponsorImageUpload(event)}
                    disabled={isUploadingSponsorImage}
                  />
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => setSponsorDraft((previous) => ({ ...previous, logoUrl: "" }))}
                  >
                    Limpar imagem
                  </button>
                </div>
                {sponsorDraft.logoUrl ? (
                  <img
                    className="admin-image-preview"
                    src={resolveApiAssetUrl(sponsorDraft.logoUrl)}
                    alt="Preview patrocinador"
                    loading="lazy"
                  />
                ) : null}
              </label>

              <label className="full">
                Descricao
                <textarea
                  rows={3}
                  value={sponsorDraft.description}
                  onChange={(event) =>
                    setSponsorDraft((previous) => ({
                      ...previous,
                      description: event.target.value
                    }))
                  }
                  required
                />
              </label>

              <label className="full">
                Link do site (opcional)
                <input
                  type="text"
                  value={sponsorDraft.websiteUrl}
                  onChange={(event) =>
                    setSponsorDraft((previous) => ({
                      ...previous,
                      websiteUrl: event.target.value
                    }))
                  }
                  placeholder="https://site-do-patrocinador.com.br"
                />
              </label>

              <label>
                Ordem de exibicao
                <input
                  type="number"
                  value={sponsorDraft.displayOrder}
                  onChange={(event) =>
                    setSponsorDraft((previous) => ({
                      ...previous,
                      displayOrder: Number.parseInt(event.target.value, 10) || 0
                    }))
                  }
                />
              </label>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={sponsorDraft.active}
                  onChange={(event) =>
                    setSponsorDraft((previous) => ({ ...previous, active: event.target.checked }))
                  }
                />
                Ativo no site
              </label>

              <div className="admin-inline-actions full">
                <button className="button button-primary" type="submit" disabled={isSavingSponsor}>
                  {isSavingSponsor
                    ? "Salvando..."
                    : editingSponsorId == null
                      ? "Criar patrocinador"
                      : "Atualizar patrocinador"}
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => {
                    setEditingSponsorId(null);
                    setSponsorDraft(emptySponsorDraft);
                  }}
                >
                  Limpar
                </button>
              </div>
            </form>

            {sponsorMessage ? <p className="admin-message">{sponsorMessage}</p> : null}

            <div className="admin-list">
              {sortedSponsors.map((sponsor) => (
                <article key={sponsor.id} className="admin-list-item">
                  <div>
                    <strong>{sponsor.name}</strong>
                    <p>{sponsor.description}</p>
                    <span>
                      ordem {sponsor.displayOrder} | {sponsor.active ? "ativo" : "inativo"}
                    </span>
                  </div>
                  <div className="admin-inline-actions">
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => {
                        setEditingSponsorId(sponsor.id);
                        setSponsorDraft({
                          name: sponsor.name,
                          description: sponsor.description,
                          logoUrl: sponsor.logoUrl,
                          websiteUrl: sponsor.websiteUrl,
                          active: sponsor.active,
                          displayOrder: sponsor.displayOrder
                        });
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void handleDeleteSponsor(sponsor.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default AdminApp;
