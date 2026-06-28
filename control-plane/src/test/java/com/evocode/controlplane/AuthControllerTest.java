package com.evocode.controlplane;

import com.evocode.controlplane.auth.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;

    @BeforeEach
    void clean() {
        users.deleteAll();
    }

    @Test
    void register_returns_token_and_first_user_is_admin() throws Exception {
        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@e.com\",\"password\":\"password123\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.token").isNotEmpty())
            .andExpect(jsonPath("$.user.email").value("a@e.com"))
            .andExpect(jsonPath("$.user.role").value("ADMIN"));
    }

    @Test
    void second_user_is_plain_user() throws Exception {
        register("admin@e.com", "password123");
        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"b@e.com\",\"password\":\"password123\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.user.role").value("USER"));
    }

    @Test
    void duplicate_email_returns_409() throws Exception {
        register("dup@e.com", "password123");
        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"dup@e.com\",\"password\":\"password123\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void register_with_short_password_returns_400() throws Exception {
        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@e.com\",\"password\":\"short\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void login_succeeds_with_correct_password() throws Exception {
        register("login@e.com", "password123");
        mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"login@e.com\",\"password\":\"password123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void login_with_wrong_password_returns_401() throws Exception {
        register("login@e.com", "password123");
        mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"login@e.com\",\"password\":\"wrongpass1\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void me_requires_token_and_returns_user() throws Exception {
        String token = mapper.readTree(register("me@e.com", "password123"))
            .get("token").asText();
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value("me@e.com"));
    }

    @Test
    void protected_endpoint_without_token_returns_401() throws Exception {
        mvc.perform(get("/api/projects")).andExpect(status().isUnauthorized());
    }

    private String register(String email, String pass) throws Exception {
        return mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + pass + "\"}"))
            .andReturn().getResponse().getContentAsString();
    }
}
